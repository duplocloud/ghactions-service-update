import {expect, jest} from '@jest/globals'
import {DataSource} from '../src/duplocloud/datasource'
import {DuploHttpClient} from '../src/duplocloud/httpclient'
import {ServiceUpdater} from '../src/service-updater'
import {lastValueFrom} from 'rxjs'

describe('ServiceUpdater integration', () => {
  // Integration tests.
  const tenantId = process.env.duplo_tenant_id
  const tenantName = process.env.duplo_tenant_name
  if (!tenantId || !tenantName || !process.env.duplo_token) {
    console.log(
      'Skipping integration tests: duplo_token and/or duplo_tenant_id and/or duplo_tenant_name env var missing or empty'
    )
    it('is skipped', () => {})
  } else {
    describe('buildServiceUpdate', () => {
      jest.setTimeout(15000)

      it('patches a replication controller', async () => {
        const ds = new DataSource(new DuploHttpClient())

        // Get tenant
        const tenant = await lastValueFrom(ds.getTenant(tenantId))
        expect(tenant).not.toBeNull()
        expect(tenant?.TenantId).not.toBeNull()
        if (tenant?.TenantId) {
          // Get other information
          const existing = await lastValueFrom(ds.getReplicationController(tenant.TenantId, 'website'))
          expect(existing).not.toBeNull()
          if (existing) {
            const pods = await lastValueFrom(ds.getPodsByService(tenant.TenantId, 'website'))

            // Build the request
            const request = {
              Name: 'website',
              Image: existing?.Image == 'nginx:latest' ? 'nginx:1.21-alpine' : 'nginx:latest',
              AgentPlatform: 0
            }

            // Build the service updater
            const updater = new ServiceUpdater(tenant, request, existing, pods, ds)

            // Update the service
            const done = await lastValueFrom(updater.buildServiceUpdate())

            // Read it back and confirm that it changed.
            const result = await lastValueFrom(ds.getReplicationController(tenant.TenantId, 'website'))
            expect(result?.Image).toEqual(request.Image)
          }
        }
      })
    })
  }
})
