import * as core from '@actions/core'
import {
  EcsServiceModel,
  EcsServicePatchRequest,
  EcsTaskDefinitionArn,
  Pod,
  ReplicationController,
  ReplicationControllerChangeRequest,
  UserTenant
} from './duplocloud/model'
import {EcsServicePatchResult, EcsServiceUpdater} from './ecs-service-updater'
import {Observable, forkJoin, lastValueFrom} from 'rxjs'
import {ServicePatchResult, ServiceUpdateRequest, ServiceUpdater, bulkServiceUpdate} from './service-updater'
import {DataSource} from './duplocloud/datasource'
import {DuploHttpClient} from './duplocloud/httpclient'

export interface ServicePatchResults {
  [name: string]: ServicePatchResult
}

export class Runner {
  static readonly ERROR_NOTHING_TO_DO = 'Input(s) services and/or ecs_services must be set: nothing to do'
  static readonly ERROR_NO_TENANT_SPECIFIED = 'No tenant specified'
  static readonly ERROR_NO_SUCH_TENANT = 'No such tenant'
  static readonly ERROR_NO_SUCH_DUPLO_SERVICE = 'No such duplo service'
  static readonly ERROR_NO_SUCH_ECS_SERVICE = 'No such ECS service'
  static readonly ERROR_NO_SUCH_ECS_TASKDEF = 'Cannot find ECS task definition ARN for'
  static readonly ERROR_FAILED_TO_UPDATE = 'Failed to update service'
  static readonly ERROR_BAD_AGENT_PLATFORM = 'Unsupported agent platform'

  /**
   * Updates one or more duplo services in parallel
   * @param ds      duplo API data source
   * @param tenant  duplo tenant being acted on
   * @returns a map of service name to API call status
   */
  async updateServices(ds: DataSource, tenant: UserTenant, useBulkApi = false): Promise<ServicePatchResults> {
    // Parse requested updates.
    let serviceUpdates: ServiceUpdateRequest[] = JSON.parse(core.getInput('services') || '[]')
    const haveServiceUpdates = !!serviceUpdates?.length
    const ecsUpdates: EcsServicePatchRequest[] = JSON.parse(core.getInput('ecs_services') || '[]')
    const haveEcsUpdates = !!ecsUpdates?.length
    if (!haveServiceUpdates && !haveEcsUpdates) {
      throw new Error(Runner.ERROR_NOTHING_TO_DO)
    }

    // Try to repair possible bad input from the user.
    if (!Array.isArray(serviceUpdates)) serviceUpdates = [serviceUpdates]
    for (const serviceUpdate of serviceUpdates) {
      // Validate Agent Platform
      let agentPlatform: string | number | undefined = serviceUpdate.AgentPlatform
      if (typeof agentPlatform == 'string' && /^[0-9]+/.test(agentPlatform)) agentPlatform = parseInt(agentPlatform)
      if (![0, 5, 7, undefined, null].includes(agentPlatform))
        throw new Error(
          `${Runner.ERROR_BAD_AGENT_PLATFORM}: service ${serviceUpdate.Name}: platform ${JSON.stringify(
            serviceUpdate.AgentPlatform
          )}`
        )
    }

    // Collect information about the services to update
    var lookupApis: any = {}
    if (haveServiceUpdates) {
      lookupApis.services = ds.getReplicationControllers(tenant.TenantId)
      lookupApis.pods = ds.getPods(tenant.TenantId)
    }
    if (haveEcsUpdates) {
      lookupApis.ecsServices = ds.getAllEcsServices(tenant.TenantId)
      lookupApis.ecsTaskDefs = ds.getAllEcsTaskDefArns(tenant.TenantId)
    }

    const lookups: any = await lastValueFrom(forkJoin(lookupApis))
    // Create the service updater instances.
    const serviceUpdaters: {[name: string]: ServiceUpdater } = {};
    for (const desired of serviceUpdates) {
      const existing = lookups.services?.find((svc: {Name: string}) => svc.Name === desired.Name)
      if (!existing) throw new Error(`${Runner.ERROR_NO_SUCH_DUPLO_SERVICE}: ${desired.Name}`)

      const pods = lookups?.pods?.filter((pod: {Name: string}) => pod.Name === desired.Name) || []
      serviceUpdaters[desired.Name] = new ServiceUpdater(tenant, desired, existing, pods, ds)
    }
    
    const ecsServiceUpdaters: {[name: string]:  EcsServiceUpdater } = {};
    for (const desired of ecsUpdates) {
      const existingService = lookups?.ecsServices?.find((svc: {Name: string}) => svc.Name === desired.Name)
      if (!existingService) throw new Error(`${Runner.ERROR_NO_SUCH_ECS_SERVICE}: ${desired.Name}`)

      const existingTaskDefArn = lookups?.ecsTaskDefs?.find(
        (svc: {TaskDefinitionArn: any}) => svc.TaskDefinitionArn === existingService.TaskDefinition
      )
      if (!existingTaskDefArn) throw new Error(`${Runner.ERROR_NO_SUCH_ECS_TASKDEF}: ${desired.Name}`)

      ecsServiceUpdaters[desired.Name] = new EcsServiceUpdater(tenant, desired, existingService, existingTaskDefArn, ds)
    }

    // Build the updates to execute in parallel.
    const apiCalls: {[name: string]: Observable<ServicePatchResult | EcsServicePatchResult>} = {}

    let serviceKeys: string[] = Object.keys(serviceUpdaters);
    if (useBulkApi) {
      let repChangeList: ReplicationControllerChangeRequest[] = [];
      for (const name of serviceKeys) {
        repChangeList.push(serviceUpdaters[name].buildUpdatePayload());
      }
      apiCalls['Service-Bulk-Update'] = bulkServiceUpdate(serviceUpdaters[serviceKeys[0]], repChangeList);
    } else {
      for (const name of serviceKeys) {
        apiCalls[name] = serviceUpdaters[name].buildServiceUpdate();
      }
    }

    for (const name of Object.keys(ecsServiceUpdaters)) {
      apiCalls[name] = ecsServiceUpdaters[name].buildServiceUpdate()
    }

    // Perform the updates in parallel, failing on error.
    return lastValueFrom(forkJoin(apiCalls)) as Promise<ServicePatchResults>
  }

  async runAction(): Promise<void> {
    // Should we be verbose?
    const verbose = core.getBooleanInput('verbose')

    try {
      // Connect to Duplo.
      const duploHost = core.getInput('duplo_host')
      const duploToken = core.getInput('duplo_token')
      const useBulkApi = core.getBooleanInput('use_bulk_api')
      const ds = new DataSource(new DuploHttpClient(duploHost, duploToken))

      // Collect tenant information.
      const tenantInput = core.getInput('tenant')
      if (!tenantInput) throw new Error(Runner.ERROR_NO_TENANT_SPECIFIED)
      const tenant = await lastValueFrom(ds.getTenant(tenantInput))
      if (!tenant) throw new Error(`${Runner.ERROR_NO_SUCH_TENANT}: ${tenantInput}`)

      // Update all services.
      const updateResults = await this.updateServices(ds, tenant, useBulkApi)

      // Check for failures.
      if (updateResults) {
        const failures: string[] = []
        for (const key of Object.keys(updateResults)) {
          if (!updateResults[key].UpdateSucceeded) {
            failures.push(key)
          }
        }
        if (failures.length)
          throw new Error(`${Runner.ERROR_FAILED_TO_UPDATE}${failures.length > 1 ? 's' : ''}: ${failures.join(', ')}`)
      }
    } catch (error) {
      if (verbose) {
        // eslint-disable-next-line no-console
        console.log('error', error)
      }
      if (error instanceof Error) {
        core.setFailed(error.message)
      } else {
        core.setFailed(`${error}`)
      }
    }
  }
}
