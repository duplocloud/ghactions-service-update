import {expect, test} from '@jest/globals'

import {DataSource} from '../src/duplocloud/datasource'
import {DuploHttpClient} from '../src/duplocloud/httpclient'

const tenantId = process.env.duplo_tenant_id
if (!tenantId) {
  console.log('Skipping datasource tests: duplo_tenant_id env var missing or empty')
} else {
  test('DataSource: can list tenants accessible to the user', async () => {
    const ds = new DataSource(new DuploHttpClient())
    const result = await ds.getTenantsForUser().toPromise()
    expect(result).not.toBeNull()
  })

  test('DataSource: can get default tenant', async () => {
    const ds = new DataSource(new DuploHttpClient())
    const result = await ds.getTenantByName('default').toPromise()
    expect(result).not.toBeNull()
  })

  test('DataSource: can get tenant by name or ID', async () => {
    const ds = new DataSource(new DuploHttpClient())
    const result = await ds.getTenantByName('default').toPromise()
    expect(result?.TenantId).not.toBeNull()

    if (result?.TenantId) {
      const resultByName = await ds.getTenant('default').toPromise()
      expect(resultByName).toEqual(result)
      const resultById = await ds.getTenant(result.TenantId).toPromise()
      expect(resultById).toEqual(result)
    }
  })

  test('DataSource: can list replication controllers', async () => {
    const ds = new DataSource(new DuploHttpClient())
    const result = await ds.getReplicationControllers(tenantId).toPromise()
    expect(result).not.toBeNull()
  })

  test('DataSource: can patch a replication controller', async () => {
    const ds = new DataSource(new DuploHttpClient())

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

  test('DataSource: can list pods', async () => {
    const ds = new DataSource(new DuploHttpClient())
    const result = await ds.getPods(tenantId).toPromise()
    expect(result).not.toBeNull()
    expect(result.length).toBeGreaterThan(0)
  })

  test('DataSource: can list pods for a service', async () => {
    const ds = new DataSource(new DuploHttpClient())
    const result = await ds.getPodsByService(tenantId, 'website').toPromise()
    expect(result).not.toBeNull()
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].Name).toBe('website')
  })
}
