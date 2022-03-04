import {expect, jest} from '@jest/globals'

import {DataSource} from '../../src/duplocloud/datasource'
import {DuploHttpClient} from '../../src/duplocloud/httpclient'

describe('DataSource integration', () => {
  // Integration tests.
  const tenantId = process.env.duplo_tenant_id
  if (!tenantId || !process.env.duplo_token) {
    console.log('Skipping integration tests: duplo_token and/or duplo_tenant_id env var missing or empty')
    it('is skipped', () => {})
  } else {
    const ds = new DataSource(new DuploHttpClient())

    describe('getTenantsForUser', () => {
      it('lists tenants accessible to the user', async () => {
        const result = await ds.getTenantsForUser().toPromise()
        expect(result).not.toBeNull()
      })
    })

    describe('getTenantByName', () => {
      it('converts uppercase name', async () => {
        const result = await ds.getTenantByName('DEFAULT').toPromise()
        expect(result).not.toBeNull()
        expect(result?.AccountName).toBe('default')
      })

      it('can get default tenant', async () => {
        const result = await ds.getTenantByName('default').toPromise()
        expect(result).not.toBeNull()
        expect(result?.AccountName).toBe('default')
      })
    })

    describe('getTenant', () => {
      it('converts uppercase name', async () => {
        const result = await ds.getTenant('DEFAULT').toPromise()
        expect(result).not.toBeNull()
        expect(result?.AccountName).toBe('default')
      })

      it('can get tenant by name or ID', async () => {
        const result = await ds.getTenantByName('default').toPromise()
        expect(result?.TenantId).not.toBeNull()

        if (result?.TenantId) {
          const resultByName = await ds.getTenant('default').toPromise()
          expect(resultByName).toEqual(result)
          const resultById = await ds.getTenant(result.TenantId).toPromise()
          expect(resultById).toEqual(result)
        }
      })
    })

    describe('getReplicationControllers', () => {
      it('list all replication controllers in a tenant', async () => {
        const result = await ds.getReplicationControllers(tenantId).toPromise()
        expect(result).not.toBeNull()
      })
    })

    describe('patchService', () => {
      jest.setTimeout(10000)

      it('patches a replication controller', async () => {
        // Get the current image.
        const orig = await ds.getReplicationController(tenantId, 'website').toPromise()
        expect(orig).not.toBeNull()

        // Change the image.
        const request = {
          Name: 'website',
          Image: orig?.Image == 'nginx:latest' ? 'nginx:1.21-alpine' : 'nginx:latest',
          AgentPlatform: 0
        }
        const change = await ds.patchService(tenantId, request).toPromise()

        // Read it back.
        const result = await ds.getReplicationController(tenantId, 'website').toPromise()
        expect(result?.Image).toEqual(request.Image)
      })
    })

    describe('getPods', () => {
      it('lists pods all pods in a tenant', async () => {
        const result = await ds.getPods(tenantId).toPromise()
        expect(result).not.toBeNull()
        expect(result.length).toBeGreaterThan(0)
      })
    })

    describe('getPodsbyService', () => {
      it('list pods for a service', async () => {
        const result = await ds.getPodsByService(tenantId, 'website').toPromise()
        expect(result).not.toBeNull()
        expect(result.length).toBeGreaterThan(0)
        expect(result[0].Name).toBe('website')
      })
    })
  }
})
