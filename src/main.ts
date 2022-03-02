import * as core from '@actions/core'
import {EcsServicePatchRequest, ServicePatchRequest, UserTenant} from './duplocloud/model'
import {EcsServicePatchResult, EcsServiceUpdater} from './ecs-service-updater'
import {EMPTY, Observable, forkJoin, of} from 'rxjs'
import {ServicePatchResult, ServiceUpdater} from './service-updater'
import {DataSource} from './duplocloud/datasource'
import {DuploHttpClient} from './duplocloud/httpclient'

interface ServicePatchResults {
  [name: string]: ServicePatchResult
}

/**
 * Updates one or more duplo services in parallel
 * @param ds      duplo API data source
 * @param tenant  duplo tenant being acted on
 * @returns a map of service name to API call status
 */
async function updateServices(ds: DataSource, tenant: UserTenant): Promise<ServicePatchResults> {
  // Parse requested updates.
  const serviceUpdates: ServicePatchRequest[] = JSON.parse(core.getInput('services') || '[]')
  const haveServiceUpdates = !!serviceUpdates.length
  const ecsUpdates: EcsServicePatchRequest[] = JSON.parse(core.getInput('ecs_services') || '[]')
  const haveEcsUpdates = !!ecsUpdates.length
  if (!haveServiceUpdates && !haveEcsUpdates) {
    throw new Error('services or ecs_services must be set: nothing to do')
  }

  // Collect information about the services to update
  const lookups = await forkJoin({
    services: haveServiceUpdates ? ds.getReplicationControllers(tenant.TenantId) : EMPTY,
    pods: haveServiceUpdates ? ds.getPods(tenant.TenantId) : EMPTY,
    ecsServices: haveEcsUpdates ? ds.getAllEcsServices(tenant.TenantId) : EMPTY,
    ecsTaskDefs: haveEcsUpdates ? ds.getAllEcsTaskDefArns(tenant.TenantId) : EMPTY
  }).toPromise()

  // eslint-disable-next-line no-console
  console.log(lookups)

  // Create the service updater instances.
  const updaters: {[name: string]: ServiceUpdater | EcsServiceUpdater} = {}
  for (const desired of serviceUpdates) {
    const existing = lookups.services.find(svc => svc.Name === desired.Name)
    if (!existing) throw new Error(`No such duplo service: ${desired.Name}`)

    const pods = lookups.pods.filter(pod => pod.Name === desired.Name)
    updaters[desired.Name] = new ServiceUpdater(tenant, desired, existing, pods, ds)
  }
  for (const desired of ecsUpdates) {
    const existingService = lookups.ecsServices.find(svc => svc.Name === desired.Name)
    if (!existingService) throw new Error(`No such ECS service: ${desired.Name}`)
    const existingTaskDefArn = lookups.ecsTaskDefs.find(svc => svc.TaskDefinitionArn === existingService.TaskDefinition)
    if (!existingTaskDefArn) throw new Error(`Cannot find ECS task definition ARN for: ${desired.Name}`)

    updaters[desired.Name] = new EcsServiceUpdater(tenant, desired, existingService, existingTaskDefArn, ds)
  }

  // Build the updates to execute in parallel.
  const apiCalls: {[name: string]: Observable<ServicePatchResult | EcsServicePatchResult>} = {}
  for (const desired of serviceUpdates) {
    apiCalls[desired.Name] = updaters[desired.Name].buildServiceUpdate()
  }

  // Perform the updates in parallel, failing on error.
  return forkJoin(apiCalls).toPromise()
}

async function run(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      // Connect to Duplo.
      const duploHost = core.getInput('duplo_host')
      const duploToken = core.getInput('duplo_token')
      const ds = new DataSource(new DuploHttpClient(duploHost, duploToken))

      // Collect tenant information.
      const tenantInput = core.getInput('tenant')
      const tenant = await ds.getTenant(tenantInput).toPromise()
      if (!tenant) throw new Error(`No such tenant: ${tenantInput}`)

      // Update all services.
      const updateResults = await updateServices(ds, tenant)

      // Check for failures.
      const failures: string[] = []
      for (const key of Object.keys(updateResults)) {
        if (!updateResults[key].UpdateSucceeded) {
          failures.push(key)
        }
      }
      if (failures.length)
        throw new Error(`Failed to update service${failures.length > 1 ? 's' : ''}: ${failures.join(', ')}`)

      resolve()
    } catch (error) {
      if (error instanceof Error) {
        core.setFailed(error.message)
        reject(error)
      } else {
        core.setFailed(`${error}`)
        reject(new Error(`${error}`))
      }
    }
  })
}

run()
