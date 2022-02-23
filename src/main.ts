import * as core from '@actions/core'
import {Observable, forkJoin, of} from 'rxjs'
import {ReplicationController, ServicePatchRequest, UserTenant} from './duplocloud/model'
import {catchError, map} from 'rxjs/operators'
import {DataSource} from './duplocloud/datasource'
import {DuploHttpClient} from './duplocloud/httpclient'

interface ServicePatchResult {
  UpdateSucceeded: boolean // did the update API succeed?
  ImagePrev: string | undefined // what was the docker image prior to the API call?
}

interface ServicePatchResults {
  [name: string]: ServicePatchResult
}

function buildServiceUpdate(
  ds: DataSource,
  tenant: UserTenant,
  desired: ServicePatchRequest,
  existing: ReplicationController
): Observable<ServicePatchResult> {
  const ImagePrev = existing.Template?.Containers[0].Image

  // Pull in the agent platform, if it is missing.
  if (!desired.AgentPlatform && desired.AgentPlatform !== 0) {
    desired.AgentPlatform = existing.Template?.AgentPlatform
  }

  // Build the API call and prepare to output status about the API call
  return ds.patchService(tenant.TenantId, desired).pipe(
    map(rp => {
      core.info(`Updated duplo service: ${desired.Name}`)
      return {ImagePrev, UpdateSucceeded: rp ?? true}
    }),
    catchError(err => {
      core.error(`Failed to update Duplo service(s): ${JSON.stringify(err)}`)
      return of({ImagePrev, UpdateSucceeded: false})
    })
  )
}

/**
 * Updates one or more duplo services in parallel
 * @param ds      duplo API data source
 * @param tenant  duplo tenant being acted on
 * @returns a map of service name to API call status
 */
async function updateServices(ds: DataSource, tenant: UserTenant): Promise<ServicePatchResults> {
  // Collect service information.
  const serviceUpdates: ServicePatchRequest[] = JSON.parse(core.getInput('services'))
  const services = await ds.getReplicationControllers(tenant.TenantId).toPromise()

  // Build the updates to execute in parallel.
  const apiCalls: {[name: string]: Observable<ServicePatchResult>} = {}
  for (const desired of serviceUpdates) {
    const existing = services.find(svc => svc.Name === desired.Name)
    if (!existing) throw new Error(`No such service: ${desired.Name}`)

    apiCalls[desired.Name] = buildServiceUpdate(ds, tenant, desired, existing)
  }

  // Perform the updates in parallel, failing on error.
  return forkJoin(apiCalls).toPromise()
}

async function run(): Promise<void> {
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
    /* const updateResults = */ await updateServices(ds, tenant)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
