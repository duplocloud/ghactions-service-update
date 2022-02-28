import * as core from '@actions/core'
import {Observable, forkJoin} from 'rxjs'
import {ServicePatchRequest, UserTenant} from './duplocloud/model'
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
  // Collect information about the services to update
  const serviceUpdates: ServicePatchRequest[] = JSON.parse(core.getInput('services'))
  const lookups = await forkJoin({
    services: ds.getReplicationControllers(tenant.TenantId),
    pods: ds.getPods(tenant.TenantId)
  }).toPromise()

  // Create the service updater instances.
  const updaters: {[name: string]: ServiceUpdater} = {}
  for (const desired of serviceUpdates) {
    const existing = lookups.services.find(svc => svc.Name === desired.Name)
    if (!existing) throw new Error(`No such service: ${desired.Name}`)

    const pods = lookups.pods.filter(pod => pod.Name === desired.Name)
    updaters[desired.Name] = new ServiceUpdater(tenant, desired, existing, pods, ds)
  }

  // Build the updates to execute in parallel.
  const apiCalls: {[name: string]: Observable<ServicePatchResult>} = {}
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
      if (failures.length) throw new Error(`Failed to update services: ${failures.join(', ')}`)

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
