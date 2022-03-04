import {expect, jest} from '@jest/globals'

import {ServiceUpdater, ServiceUpdateRequest} from '../src/service-updater'
import {DataSource} from '../src/duplocloud/datasource'
import {of} from 'rxjs'
import {AgentPlatform, Pod, PodContainer, PodTemplate, ReplicationController, ReplicationControllerChangeRequest, UserTenant} from '../src/duplocloud/model'
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
  beforeEach(() => {
    tenant = new UserTenant({TenantId: 'FAKE_TENANT_ID', AccountName: 'fake'})
    desired = new ServiceUpdateRequest({Name: 'foo', Image: 'nginx:oldest'})
    existing = rpcFaker('foo', 0, 'nginx:latest')
    pods = []
  })

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

    // Initialize the default expected value prior to each test.
    const defaultExpected = () => new ReplicationControllerChangeRequest({
      Name: desired.Name,
      Image: desired.Image,

      // AgentPlatform can be explicitly specified, or implicity read from the backend
      AgentPlatform: (desired.AgentPlatform || desired.AgentPlatform===0) ? desired.AgentPlatform : existing.Template?.AgentPlatform
    })
    let expected = defaultExpected()
    beforeEach(() => expected = defaultExpected())

    describe('AgentPlatform', () => {
      it('can be implicitly read from the ReplicationController', async () => {
        expected.AgentPlatform = existing.Template?.AgentPlatform as AgentPlatform

        const result = await createServiceUpdater().buildServiceUpdate().toPromise()

        expect(core.error).not.toHaveBeenCalled()
        expect(result?.UpdateSucceeded).toBeTruthy()
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
      })

      it('can be explicitly passed', async () => {
        if (existing.Template) existing.Template.AgentPlatform = 0
        expected.AgentPlatform = desired.AgentPlatform = 7

        const result = await createServiceUpdater().buildServiceUpdate().toPromise()

        expect(core.error).not.toHaveBeenCalled()
        expect(result?.UpdateSucceeded).toBeTruthy()
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
      })
    })

    describe('ExtraConfig', () => {
      it('is not written when not specified', async () => {
        delete expected.ExtraConfig
        const result = await createServiceUpdater().buildServiceUpdate().toPromise()

        expect(core.error).not.toHaveBeenCalled()
        expect(result?.UpdateSucceeded).toBeTruthy()
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
      })

      describe('from Env', () => {
        beforeEach(() => desired.Env = [
          {Name: 'foo', Value: 'bar'}
        ])

        it('is not written when AgentPlatform is 7', async () => {
          desired.AgentPlatform = 7
          expected = defaultExpected()
          delete expected.ExtraConfig

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })
      })

      describe('from MergeEnv', () => {
        beforeEach(() => desired.MergeEnv = [
          {Name: 'foo', Value: 'bar'}
        ])

        it('is not written when AgentPlatform is 7', async () => {
          desired.AgentPlatform = 7
          expected = defaultExpected()
          delete expected.ExtraConfig

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })
      })

      describe('from DeleteEnv', () => {
        beforeEach(() => desired.DeleteEnv = ['foo'])

        it('is not written when AgentPlatform is 7', async () => {
          desired.AgentPlatform = 7
          expected = defaultExpected()
          delete expected.ExtraConfig

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })
      })
    })

    describe('OtherDockerConfig', () => {
      it('is not written when not specified', async () => {
        delete expected.OtherDockerConfig

        const result = await createServiceUpdater().buildServiceUpdate().toPromise()

        expect(core.error).not.toHaveBeenCalled()
        expect(result?.UpdateSucceeded).toBeTruthy()
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
      })

      describe('from Env', () => {
        beforeEach(() => desired.Env = [
          {Name: 'foo', Value: 'bar'}
        ])

        it('is not written when AgentPlatform is NOT 7', async () => {
          desired.AgentPlatform = 0
          expected = defaultExpected()
          delete expected.OtherDockerConfig

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })
      })

      describe('from MergeEnv', () => {
        beforeEach(() => desired.MergeEnv = [
          {Name: 'foo', Value: 'bar'}
        ])

        it('is not written when AgentPlatform is NOT 7', async () => {
          desired.AgentPlatform = 0
          expected = defaultExpected()
          delete expected.OtherDockerConfig

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })
      })

      describe('from DeleteEnv', () => {
        beforeEach(() => desired.DeleteEnv = ['foo'])

        it('is not written when AgentPlatform is NOT 7', async () => {
          desired.AgentPlatform = 0
          expected = defaultExpected()
          delete expected.OtherDockerConfig

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })
      })
    })
  })
})
