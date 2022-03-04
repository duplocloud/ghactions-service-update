import {expect, jest} from '@jest/globals'

import {Runner, ServicePatchResults} from '../src/runner'
import {ServicePatchResult} from '../src/service-updater'
import * as core from '@actions/core'
import {DataSource} from '../src/duplocloud/datasource'
import {of} from 'rxjs'
import {ServicePatchRequest, UserTenant} from '../src/duplocloud/model'

jest.mock('@actions/core')

describe('Runner unit', () => {
  const origEnv = {duplo_host: process.env.duplo_host, duplo_token: process.env.duplo_token}

  let runner = new Runner()

  // Mock different inputs for each test.
  let inputs: {[name: string]: string | (() => string)} = {}

  beforeEach(() => {
    process.env.duplo_host = 'FAKE_DUPLO_HOST'
    process.env.duplo_token = 'FAKE_DUPLO_TOKEN'
    runner = new Runner()

    // Mock tenant being returneed
    jest.spyOn(DataSource.prototype, 'getTenantsForUser').mockImplementation(() => {
      return of([new UserTenant({TenantId: 'FAKE_TENANT_ID', AccountName: 'fake'})])
    })

    // Mock inputs being set
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (typeof inputs[name] != 'function') return (inputs[name] as string) ?? ''
      return (inputs[name] as () => string)()
    })
  })

  afterEach(() => {
    Object.assign(process.env, origEnv)
    inputs = {}
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
      let services: ServicePatchRequest[] = []
      let successes: {[name: string]: boolean} = {}

      beforeEach(() => {
        inputs['tenant'] = 'fake'
        inputs['services'] = () => (services ? JSON.stringify(services) : '')

        services = []
        successes = {}

        // Mock failed updates being returned
        jest.spyOn(Runner.prototype, 'updateServices').mockImplementation((_ds: DataSource, _tenant: UserTenant) => {
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
})
