import {expect, jest} from '@jest/globals'

import {Runner, ServicePatchResults} from '../src/runner'
import {ServiceUpdater, ServiceUpdateRequest} from '../src/service-updater'
import * as core from '@actions/core'
import {DataSource} from '../src/duplocloud/datasource'
import {of, throwError} from 'rxjs'
import {AgentPlatform, Pod, PodContainer, PodTemplate, ReplicationController, UserTenant} from '../src/duplocloud/model'
import {DuploHttpClient} from '../src/duplocloud/httpclient'

jest.mock('@actions/core')

describe('Runner unit', () => {
  const origEnv = {duplo_host: process.env.duplo_host, duplo_token: process.env.duplo_token}
  const tenantFaker = () => new UserTenant({TenantId: 'FAKE_TENANT_ID', AccountName: 'fake'})

  let runner = new Runner()

  // Mock different inputs for each test.
  let inputs: {[name: string]: string | (() => string)} = {}

  // Spy on the updateServices method of the Runner
  const mockUpdateServices = jest.spyOn(Runner.prototype, 'updateServices')

  beforeEach(() => {
    process.env.duplo_host = 'FAKE_DUPLO_HOST'
    process.env.duplo_token = 'FAKE_DUPLO_TOKEN'
    runner = new Runner()

    // Mock tenant being returneed
    jest.spyOn(DataSource.prototype, 'getTenantsForUser').mockImplementation(() => {
      return of([tenantFaker()])
    })

    // Mock inputs being set
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (typeof inputs[name] != 'function') return (inputs[name] as string) ?? ''
      return (inputs[name] as () => string)()
    })
  })

  afterEach(() => {
    Object.assign(process.env, origEnv)
    inputs = {services: '[]', ecs_services: '[]'}
  })

  describe('runAction()', () => {
    describe('initialization', () => {
      it('fails without duplo_token', async () => {
        process.env.duplo_token = ''

        await runner.runAction()
        expect(core.setFailed).toHaveBeenCalled()
      })

      it('fails without duplo_host', async () => {
        process.env.duplo_host = ''

        await runner.runAction()
        expect(core.setFailed).toHaveBeenCalled()
      })

      it('fails if there is nothing to do', async () => {
        inputs['tenant'] = 'fake'

        await runner.runAction()
        expect(core.setFailed).toHaveBeenCalledWith(Runner.ERROR_NOTHING_TO_DO)
      })

      describe('tenant access', () => {
        it('fails without tenant', async () => {
          await runner.runAction()

          expect(core.getInput).toHaveBeenCalledWith('tenant')
          expect(core.setFailed).toHaveBeenCalledWith(Runner.ERROR_NO_TENANT_SPECIFIED)
        })

        it('fails if no such tenant', async () => {
          inputs['tenant'] = 'not-a-tenant'

          await runner.runAction()

          expect(core.getInput).toHaveBeenCalledWith('tenant')
          expect(core.setFailed).toHaveBeenCalledWith(`${Runner.ERROR_NO_SUCH_TENANT}: not-a-tenant`)
        })
      })
    })

    describe('result', () => {
      // Different results for each test
      let services: ServiceUpdateRequest[] = []
      let successes: {[name: string]: boolean} = {}

      beforeAll(() => {
        // Mock failed updates being returned
        mockUpdateServices.mockImplementation((_ds: DataSource, _tenant: UserTenant) => {
          const res: ServicePatchResults = {}
          for (const svc of services) {
            res[svc.Name] = {
              UpdateSucceeded: successes[svc.Name] ?? false,
              ImagePrev: undefined,
              Replicas: 0,
              Containers: []
            }
          }
          return of(res).toPromise()
        })
      })

      beforeEach(() => {
        inputs['tenant'] = 'fake'
        inputs['services'] = () => (services ? JSON.stringify(services) : '')

        services = []
        successes = {}
      })

      afterAll(() => {
        mockUpdateServices.mockRestore()
      })

      it('fails if one service failed', async () => {
        services = [{Name: 'foo', Image: 'nginx:latest'}]

        await runner.runAction()

        expect(core.getInput).toHaveBeenCalledWith('tenant')
        expect(core.setFailed).toHaveBeenCalledWith(`${Runner.ERROR_FAILED_TO_UPDATE}: foo`)
      })

      it('fails if some services failed', async () => {
        services = [
          {Name: 'foo', Image: 'nginx:latest'},
          {Name: 'foobar', Image: 'nginx:latest'}
        ]
        successes = {foo: true}

        await runner.runAction()

        expect(core.getInput).toHaveBeenCalledWith('tenant')
        expect(core.setFailed).toHaveBeenCalledWith(`${Runner.ERROR_FAILED_TO_UPDATE}: foobar`)
      })

      it('fails if all services failed', async () => {
        services = [
          {Name: 'foo', Image: 'nginx:latest'},
          {Name: 'foobar', Image: 'nginx:latest'}
        ]

        await runner.runAction()

        expect(core.getInput).toHaveBeenCalledWith('tenant')
        expect(core.setFailed).toHaveBeenCalledWith(`${Runner.ERROR_FAILED_TO_UPDATE}s: foo, foobar`)
      })

      it('succeeds if all services succeed', async () => {
        services = [
          {Name: 'foo', Image: 'nginx:latest'},
          {Name: 'foobar', Image: 'nginx:latest'}
        ]
        successes = {foo: true, foobar: true}

        await runner.runAction()

        expect(core.getInput).toHaveBeenCalledWith('tenant')
        expect(core.setFailed).not.toHaveBeenCalled()
      })
    })
  })

  describe('updateServices()', () => {
    const ds = new DataSource(new DuploHttpClient())

    // Allow changing parameters for each test
    let tenant = tenantFaker()
    let services: ServiceUpdateRequest[] = []
    let rpcs: ReplicationController[] = []
    let pods: Pod[] = []

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

    // Mock Duplo API calls.
    const mockGetRpcs = jest
      .spyOn(DataSource.prototype, 'getReplicationControllers')
      .mockImplementation((tenantId: string) => of(rpcs))
    const mockGetPods = jest.spyOn(DataSource.prototype, 'getPods').mockImplementation((tenantId: string) => of(pods))
    const mockPatchService = jest.spyOn(DataSource.prototype, 'patchService')

    beforeEach(() => {
      inputs['tenant'] = 'fake'
      inputs['services'] = () => (services ? JSON.stringify(services) : '')

      // Default to mocking success.
      mockPatchService.mockImplementation((tenantId: string, request: ServiceUpdateRequest) => of(null))
    })

    afterEach(() => {
      services = []
      rpcs = []
      pods = []
    })

    describe('updating Duplo services', () => {
      beforeEach(() => {
        services = [{Name: 'foo', Image: 'nginx:old'}]
        rpcs = [rpcFaker('foo', 7, 'nginx:latest')]
        pods = []
      })

      it('propagates errors', async () => {
        // Mock failure
        mockPatchService.mockImplementation((tenantId: string, request: ServiceUpdateRequest) => throwError('boom!'))

        const result = await runner.updateServices(ds, tenant)

        expect(core.error).toHaveBeenCalledWith(`${ServiceUpdater.FAILURE}: foo: boom!`)
      })

      it('propagates success', async () => {
        const result = await runner.updateServices(ds, tenant)

        expect(core.info).toHaveBeenCalledWith(`${ServiceUpdater.SUCCESS}: foo`)
      })

      it('fills in a missing AgentPlatform', async () => {
        const expected = {...services[0], AgentPlatform: 7}

        const result = await runner.updateServices(ds, tenant)

        expect(core.error).not.toHaveBeenCalled()

        expect(mockGetRpcs).toHaveBeenCalledWith(tenant.TenantId)
        expect(mockGetPods).toHaveBeenCalledWith(tenant.TenantId)
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected)
      })

      it('uses an explicit AgentPlatform', async () => {
        services[0].AgentPlatform = 0

        const result = await runner.updateServices(ds, tenant)

        expect(core.error).not.toHaveBeenCalled()

        expect(mockGetRpcs).toHaveBeenCalledWith(tenant.TenantId)
        expect(mockGetPods).toHaveBeenCalledWith(tenant.TenantId)
        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, services[0])
      })

      it('updates multiple services', async () => {
        services.push({Name: 'bar', Image: 'busybox:latest'})
        rpcs.push(rpcFaker('bar', 0, 'busybox:old'))

        const expected0 = {...services[0], AgentPlatform: 7}
        const expected1 = {...services[1], AgentPlatform: 0}

        const result = await runner.updateServices(ds, tenant)

        expect(mockGetRpcs).toHaveBeenCalledWith(tenant.TenantId)
        expect(mockGetPods).toHaveBeenCalledWith(tenant.TenantId)

        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected0)
        expect(core.info).toHaveBeenCalledWith(`${ServiceUpdater.SUCCESS}: foo`)

        expect(mockPatchService).toHaveBeenCalledWith(tenant.TenantId, expected1)
        expect(core.info).toHaveBeenCalledWith(`${ServiceUpdater.SUCCESS}: bar`)
      })
    })
  })
})
