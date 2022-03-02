import {expect, jest, test, beforeAll} from '@jest/globals'
import {forkJoin} from 'rxjs'
import {DataSource} from '../src/duplocloud/datasource'
import {DuploHttpClient} from '../src/duplocloud/httpclient'
import {ServiceUpdater} from '../src/service-updater'

const tenantId = process.env.duplo_tenant_id
if (!tenantId) {
  console.log('Skipping service updater tests: duplo_tenant_id env var missing or empty')
} else {
  jest.setTimeout(15000)

  test('ServiceUpdater: can patch a replication controller', async () => {
    const ds = new DataSource(new DuploHttpClient())

    // Get tenant
    const tenant = await ds.getTenant(tenantId).toPromise()
    expect(tenant).not.toBeNull()
    expect(tenant?.TenantId).not.toBeNull()
    if (tenant?.TenantId) {
      // Get other information
      const existing = await ds.getReplicationController(tenant.TenantId, 'website').toPromise()
      expect(existing).not.toBeNull()
      if (existing) {
        const pods = await ds.getPodsByService(tenant.TenantId, 'website').toPromise()

        // Build the request
        const request = {
          Name: 'website',
          Image: existing?.Image == 'nginx:latest' ? 'nginx:1.21-alpine' : 'nginx:latest',
          AgentPlatform: 0
        }

        // Build the service updater
        const updater = new ServiceUpdater(tenant, request, existing, pods, ds)

        // Update the service
        const done = await updater.buildServiceUpdate().toPromise()

        // Read it back and confirm that it changed.
        const result = await ds.getReplicationController(tenant.TenantId, 'website').toPromise()
        expect(result?.Image).toEqual(request.Image)
      }
    }
  })
}
