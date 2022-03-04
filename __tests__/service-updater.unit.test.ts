import {expect, jest} from '@jest/globals'

import {ServiceUpdater, ServiceUpdateRequest} from '../src/service-updater'
import {DataSource} from '../src/duplocloud/datasource'
import {of} from 'rxjs'
import {AgentPlatform, Pod, PodContainer, PodTemplate, ReplicationController, UserTenant} from '../src/duplocloud/model'
import {DuploHttpClient} from '../src/duplocloud/httpclient'
import * as core from '@actions/core'

jest.mock('@actions/core')
jest.mock('../src/duplocloud/httpclient')
jest.mock('../src/duplocloud/datasource')

describe('ServiceUpdater unit', () => {
  // The mocked data source.
  const ds = new DataSource(new DuploHttpClient())

  // Function that returns a fake ReplicationController.
  const rpcFaker = (Name: string, AgentPlatform: AgentPlatform, Image: string) =>
    new ReplicationController({
      Name,
      Template: new PodTemplate({
        AgentPlatform,
        Containers: [
          new PodContainer({
            Image
          })
        ]
      })
    })

  // Different parameters for each test.
  let tenant = new UserTenant({TenantId: 'FAKE_TENANT_ID', AccountName: 'fake'})
  let desired = new ServiceUpdateRequest({Name: 'foo', Image: 'nginx:oldest'})
  let existing = rpcFaker('foo', 0, 'nginx:latest')
  let pods: Pod[] = []

  // Mock the patchService method to succeed by default.
  const mockPatchService = jest.spyOn(DataSource.prototype, 'patchService')
  beforeEach(() => mockPatchService.mockImplementation((tenantId: string, request: ServiceUpdateRequest) => of(null)))

  // Function that creates a service updater.
  const createServiceUpdater = () => new ServiceUpdater(tenant, desired, existing, pods, ds)

  // Change env vars before each test, then restore them.
  const origEnv = {duplo_host: process.env.duplo_host, duplo_token: process.env.duplo_token}
  beforeEach(() => {
    process.env.duplo_host = 'FAKE_DUPLO_HOST'
    process.env.duplo_token = 'FAKE_DUPLO_TOKEN'
  })
  afterEach(() => Object.assign(process.env, origEnv))

  describe('buildServiceUpdate()', () => {
    describe('AgentPlatform', () => {
      it('can be implicitly read from the ReplicationController', async () => {
        const expected = {AgentPlatform: existing.Template?.AgentPlatform, ...desired}

        const result = await createServiceUpdater().buildServiceUpdate().toPromise()

        expect(core.error).not.toHaveBeenCalled()
        expect(result?.UpdateSucceeded).toBeTruthy()
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
      })

      it('can be explicitly passed', async () => {
        const expected = {AgentPlatform: 0, ...desired}
        desired.AgentPlatform = 0

        const result = await createServiceUpdater().buildServiceUpdate().toPromise()

        expect(core.error).not.toHaveBeenCalled()
        expect(result?.UpdateSucceeded).toBeTruthy()
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
      })
    })

    describe('ExtraConfig', () => {
      it('is not written when not specified', async () => {
        const expected = {AgentPlatform: existing.Template?.AgentPlatform, ...desired}

        const result = await createServiceUpdater().buildServiceUpdate().toPromise()

        expect(core.error).not.toHaveBeenCalled()
        expect(result?.UpdateSucceeded).toBeTruthy()
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
      })
    })

    describe('OtherDockerConfig', () => {
      it('is not written when not specified', async () => {
        const expected = {AgentPlatform: existing.Template?.AgentPlatform, ...desired}

        const result = await createServiceUpdater().buildServiceUpdate().toPromise()

        expect(core.error).not.toHaveBeenCalled()
        expect(result?.UpdateSucceeded).toBeTruthy()
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
      })
    })
  })
})
