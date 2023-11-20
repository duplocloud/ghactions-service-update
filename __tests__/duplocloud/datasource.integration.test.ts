import {expect, jest} from '@jest/globals'
import {lastValueFrom} from 'rxjs'
import {DataSource} from '../../src/duplocloud/datasource'
import {DuploHttpClient} from '../../src/duplocloud/httpclient'

describe('DataSource integration', () => {
  // Integration tests.
  const tenantId = process.env.duplo_tenant_id
  const tenantName = process.env.duplo_tenant_name
  if (!tenantId || !tenantName || !process.env.duplo_token) {
    console.log(
      'Skipping integration tests: duplo_token and/or duplo_tenant_id and/or duplo_tenant_name env var missing or empty'
    )
    it('is skipped', () => {})
  } else {
    const ds = new DataSource(new DuploHttpClient())

    describe('getTenantsForUser', () => {
      it('lists tenants accessible to the user', async () => {
        const result = await lastValueFrom(ds.getTenantsForUser())
        expect(result).not.toBeNull()
      })
    })

    describe('getTenantByName', () => {
      it('converts uppercase name', async () => {
        const result = await lastValueFrom(ds.getTenantByName(tenantName.toUpperCase()))
        expect(result).not.toBeNull()
        expect(result?.AccountName).toBe(tenantName)
      })

      it('can get default tenant', async () => {
        const result = await lastValueFrom(ds.getTenantByName(tenantName))
        expect(result).not.toBeNull()
        expect(result?.AccountName).toBe(tenantName)
      })
    })

    describe('getTenant', () => {
      it('converts uppercase name', async () => {
        const result = await lastValueFrom(ds.getTenant(tenantName.toUpperCase()))
        expect(result).not.toBeNull()
        expect(result?.AccountName).toBe(tenantName)
      })

      it('can get tenant by name or ID', async () => {
        const result = await lastValueFrom(ds.getTenantByName(tenantName))
        expect(result?.TenantId).not.toBeNull()

        if (result?.TenantId) {
          const resultByName = await lastValueFrom(ds.getTenant(tenantName))
          expect(resultByName).toEqual(result)
          const resultById = await lastValueFrom(ds.getTenant(result.TenantId))
          expect(resultById).toEqual(result)
        }
      })
    })

    describe('getReplicationControllers', () => {
      it('list all replication controllers in a tenant', async () => {
        const result = await lastValueFrom(ds.getReplicationControllers(tenantId))
        expect(result).not.toBeNull()
      })
    })

    describe('patchService', () => {
      jest.setTimeout(10000)

      it('patches a replication controller', async () => {
        // Get the current image.
        const orig = await lastValueFrom(ds.getReplicationController(tenantId, 'website'))
        expect(orig).not.toBeNull()

        // Change the image.
        const request = {
          Name: 'website',
          Image: orig?.Image == 'nginx:latest' ? 'nginx:1.21-alpine' : 'nginx:latest',
          AgentPlatform: 0
        }
        const change = await lastValueFrom(ds.patchService(tenantId, request))

        // Read it back.
        const result = await lastValueFrom(ds.getReplicationController(tenantId, 'website'))
        expect(result?.Image).toEqual(request.Image)
      })
    })

    describe('getPods', () => {
      it('lists pods all pods in a tenant', async () => {
        const result = await lastValueFrom(ds.getPods(tenantId))
        expect(result).not.toBeNull()
        expect(result.length).toBeGreaterThan(0)
      })
    })

    describe('getPodsbyService', () => {
      it('list pods for a service', async () => {
        const result = await lastValueFrom(ds.getPodsByService(tenantId, 'website'))
        expect(result).not.toBeNull()
        expect(result.length).toBeGreaterThan(0)
        expect(result[0].Name).toBe('website')
      })
    })
  }
})
