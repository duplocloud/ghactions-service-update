import {expect, jest} from '@jest/globals'
import {DataSource} from '../src/duplocloud/datasource'
import {DuploHttpClient} from '../src/duplocloud/httpclient'
import {EcsTaskDefinitionArn} from '../src/duplocloud/model'
import {EcsServiceUpdater} from '../src/ecs-service-updater'
import {lastValueFrom} from 'rxjs'

describe('EcsServiceUpdater integration', () => {
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

      it('patches an ECS service', async () => {
        const ds = new DataSource(new DuploHttpClient())

        // Get tenant
        const tenant = await lastValueFrom(ds.getTenant(tenantId))
        expect(tenant).not.toBeNull()
        expect(tenant?.TenantId).not.toBeNull()
        if (tenant?.TenantId) {
          // Get other information
          const existingService = await lastValueFrom(ds.getEcsService(tenant.TenantId, 'duploservices-gha-tests-www'))
          expect(existingService).not.toBeNull()
          if (existingService) {
            const existingTaskDefArn = new EcsTaskDefinitionArn(existingService.TaskDefinition)
            const existingTaskDef = await lastValueFrom(
              ds.getTaskDefinitionDetails(tenant.TenantId, existingService.TaskDefinition)
            )
            const ImagePrev = existingTaskDef.ContainerDefinitions.find(cnt => cnt.Name === 'default')?.Image

            // Build the request
            const request = {
              Name: 'www',
              Image: ImagePrev === 'nginx:latest' ? 'nginx:1.21-alpine' : 'nginx:latest'
            }

            // Build the service updater
            const updater = new EcsServiceUpdater(tenant, request, existingService, existingTaskDefArn, ds)

            // Update the service
            const done = await lastValueFrom(updater.buildServiceUpdate())
            expect(done.UpdateSucceeded).toBeTruthy()
            expect(done.TaskDefinitionArn).not.toBeNull()

            // Read it back and confirm that it changed.
            const changedService = await lastValueFrom(ds.getEcsService(tenant.TenantId, 'duploservices-gha-tests-www'))
            expect(changedService).not.toBeNull()
            if (changedService) {
              expect(changedService?.TaskDefinition).toEqual(done?.TaskDefinitionArn)
              const changedTaskDef = await lastValueFrom(
                ds.getTaskDefinitionDetails(tenant.TenantId, changedService.TaskDefinition)
              )
              const changedImage = changedTaskDef.ContainerDefinitions.find(cnt => cnt.Name === 'default')?.Image
              expect(changedImage).toEqual(request.Image)
            }
          }
        }
      })
    })
  }
})
