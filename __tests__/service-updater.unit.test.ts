import {expect, jest} from '@jest/globals'

import {ServiceUpdater, ServiceUpdateRequest} from '../src/service-updater'
import {DataSource} from '../src/duplocloud/datasource'
import {of} from 'rxjs'
import {AgentPlatform, Pod, PodContainer, PodTemplate, ReplicationController, ReplicationControllerChangeRequest, UserTenant} from '../src/duplocloud/model'
import {DuploHttpClient} from '../src/duplocloud/httpclient'
import * as core from '@actions/core'
import { connectableObservableDescriptor } from 'rxjs/internal/observable/ConnectableObservable'

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
      AgentPlatform: (desired.AgentPlatform || desired.AgentPlatform===0) ? desired.AgentPlatform : existing.Template.AgentPlatform
    })
    let expected = defaultExpected()
    beforeEach(() => expected = defaultExpected())

    describe('AgentPlatform', () => {
      it('can be implicitly read from the ReplicationController', async () => {
        expected.AgentPlatform = existing.Template.AgentPlatform

        const result = await createServiceUpdater().buildServiceUpdate().toPromise()

        expect(core.error).not.toHaveBeenCalled()
        expect(result?.UpdateSucceeded).toBeTruthy()
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
      })

      it('can be explicitly passed', async () => {
        existing.Template.AgentPlatform = 0
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
        beforeEach(() => desired.Env = ({foo: 'bar'}) )

        it('is not written when AgentPlatform is 7', async () => {
          desired.AgentPlatform = 7
          expected = defaultExpected()
          delete expected.ExtraConfig

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()
          expected.OtherDockerConfig = mockPatchService.mock.calls[0][1].OtherDockerConfig

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('overwrites ExtraConfig', async () => {
          existing.Template.ExtraConfig = JSON.stringify({bar: 'foo'})
          expected.ExtraConfig = JSON.stringify({foo: 'bar'})

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })
      })

      describe('from MergeEnv', () => {
        beforeEach(() => desired.MergeEnv = ({foo: 'bar'}))

        it('is not written when AgentPlatform is 7', async () => {
          desired.AgentPlatform = 7
          expected = defaultExpected()
          delete expected.ExtraConfig

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()
          expected.OtherDockerConfig = mockPatchService.mock.calls[0][1].OtherDockerConfig

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('adds to ExtraConfig', async () => {
          existing.Template.ExtraConfig = JSON.stringify({bar: 'foo'})
          expected.ExtraConfig = JSON.stringify({bar: 'foo', foo: 'bar'})

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
          expected.OtherDockerConfig = mockPatchService.mock.calls[0][1].OtherDockerConfig

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('removes from ExtraConfig', async () => {
          existing.Template.ExtraConfig = JSON.stringify({bar: 'foo', foo: 'bar'})
          expected.ExtraConfig = JSON.stringify({bar: 'foo'})

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('can clear ExtraConfig', async () => {
          existing.Template.ExtraConfig = JSON.stringify({foo: 'bar'})
          expected.ExtraConfig = '{}'

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })
      })
    })

    describe('OtherDockerConfig', () => {
      beforeEach(() => {
        desired.AgentPlatform = 7
        expected = defaultExpected()
      })

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
          expected.ExtraConfig = mockPatchService.mock.calls[0][1].ExtraConfig

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('only writes to OtherDockerConfig.Env', async () => {
          existing.Template.OtherDockerConfig = JSON.stringify({
            PodLabels: {foo: 'bar'},
            Env: [{Name: 'bar', Value: 'foo'}]
          })
          expected.OtherDockerConfig = JSON.stringify({
            PodLabels: {foo: 'bar'},
            Env: desired.Env
          })

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('can create a new OtherDockerConfig', async () => {
          existing.Template.OtherDockerConfig = ''
          expected.OtherDockerConfig = JSON.stringify({ Env: desired.Env })

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
          expected.ExtraConfig = mockPatchService.mock.calls[0][1].ExtraConfig

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('only writes to OtherDockerConfig.Env', async () => {
          existing.Template.OtherDockerConfig = JSON.stringify({
            PodLabels: {foo: 'bar'},
            Env: [{Name: 'bar', Value: 'foo'}]
          })
          expected.OtherDockerConfig = JSON.stringify({
            PodLabels: {foo: 'bar'},
            Env: [{Name: 'bar', Value: 'foo'},{Name: 'foo', Value: 'bar'}]
          })

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('can update entries in-place', async () => {
          desired.MergeEnv = [{Name: 'two', Value: 'TWO'}]
          existing.Template.OtherDockerConfig = JSON.stringify({
            PodLabels: {foo: 'bar'},
            Env: [{Name: 'one', Value: '1'},{Name: 'two', Value: '2'},{Name: 'three', Value: '3'}]
          })
          expected.OtherDockerConfig = JSON.stringify({
            PodLabels: {foo: 'bar'},
            Env: [{Name: 'one', Value: '1'},{Name: 'two', Value: 'TWO'},{Name: 'three', Value: '3'}]
          })

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('can create a new OtherDockerConfig', async () => {
          existing.Template.OtherDockerConfig = ''
          expected.OtherDockerConfig = JSON.stringify({ Env: desired.MergeEnv })

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
          expected.ExtraConfig = mockPatchService.mock.calls[0][1].ExtraConfig

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('only writes to OtherDockerConfig.Env', async () => {
          existing.Template.OtherDockerConfig = JSON.stringify({
            PodLabels: {foo: 'bar'},
            Env: [{Name: 'bar', Value: 'foo'},{Name: 'foo', Value: 'bar'}]
          })
          expected.OtherDockerConfig = JSON.stringify({
            PodLabels: {foo: 'bar'},
            Env: [{Name: 'bar', Value: 'foo'}]
          })

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('removes from OtherDockerConfig.Env', async () => {
          existing.Template.OtherDockerConfig = JSON.stringify({
            Env: [{Name: 'bar', Value: 'foo'},{Name: 'foo', Value: 'bar'}]
          })
          expected.OtherDockerConfig = JSON.stringify({
            Env: [{Name: 'bar', Value: 'foo'}]
          })

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })

        it('can clear OtherDockerConfig.Env', async () => {
          existing.Template.OtherDockerConfig = JSON.stringify({
            Env: [{Name: 'foo', Value: 'bar'}]
          })
          expected.OtherDockerConfig = JSON.stringify({ Env: [] })

          const result = await createServiceUpdater().buildServiceUpdate().toPromise()

          expect(core.error).not.toHaveBeenCalled()
          expect(result?.UpdateSucceeded).toBeTruthy()
          expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
        })
      })
    })
  })
})
