import * as core from '@actions/core'
import {
  ContainerDefinition,
  EcsServiceModel,
  EcsServicePatchRequest,
  EcsTaskDefinition,
  EcsTaskDefinitionArn,
  UserTenant
} from './duplocloud/model'
import {Observable, of} from 'rxjs'
import {catchError, map, mergeMap} from 'rxjs/operators'
import {DataSource} from './duplocloud/datasource'

export interface EcsServicePatchResult {
  UpdateSucceeded: boolean // did the update API succeed?
  ImagePrev: string | undefined // what was the docker image prior to the API call?
}

export class EcsServiceUpdater {
  readonly name: string

  constructor(
    readonly tenant: UserTenant,
    readonly desired: EcsServicePatchRequest,
    readonly existingService: EcsServiceModel,
    readonly existingTaskDefArn: EcsTaskDefinitionArn,
    readonly ds: DataSource
  ) {
    if (!desired?.Name?.length) throw new Error('service.Name: missing or empty')
    if (!desired?.Image?.length) throw new Error('service.Image: missing or empty')

    this.name = desired.Name
  }

  buildServiceUpdate(): Observable<EcsServicePatchResult> {
    // Find the task definition.
    return this.ds.getTaskDefinitionDetails(this.tenant.TenantId, this.existingTaskDefArn.TaskDefinitionArn).pipe(
      mergeMap(existingTaskDef => {
        // Find the container to update.
        const ImagePrev = existingTaskDef.ContainerDefinitions.find(cnt => cnt.Name === 'default')?.Image
        if (!ImagePrev) throw new Error(`ECS service: ${this.name}: cannot find default container`)

        // Create a new task definition, replacing the default container's image.
        const desiredTaskDef = new EcsTaskDefinition(existingTaskDef)
        desiredTaskDef.ContainerDefinitions = desiredTaskDef.ContainerDefinitions.map(cnt => {
          let desiredContainer = cnt
          if (cnt.Name === 'default') {
            desiredContainer = new ContainerDefinition(cnt)
            desiredContainer.Image = this.desired.Image
          }
          return cnt
        })

        // Build the API call and prepare to output status about the API call
        return this.ds.updateEcsTaskDefinition(this.tenant.TenantId, desiredTaskDef).pipe(
          mergeMap(taskDefArn => {
            core.info(`Updated ECS task definition: ${this.desired.Name}: ${taskDefArn}`)

            // Patch the ECS service, replacing the task definition.
            const desiredService = new EcsServiceModel(this.existingService)
            desiredService.TaskDefinition = taskDefArn
            return this.ds.updateEcsService(this.tenant.TenantId, desiredService).pipe(
              map(() => {
                core.info(`Updated ECS service: ${this.desired.Name}`)
                return {ImagePrev, UpdateSucceeded: true}
              }),
              catchError(err => {
                core.error(`Failed to update ECS service: ${JSON.stringify(err)}`)
                return of({ImagePrev, UpdateSucceeded: false})
              })
            )
          }),
          catchError(err => {
            core.error(`Failed to update ECS task definition: ${JSON.stringify(err)}`)
            return of({ImagePrev, UpdateSucceeded: false})
          })
        )
      }),
      catchError(err => {
        core.error(`Failed to find ECS task definition: ${JSON.stringify(err)}`)
        return of({ImagePrev: '', UpdateSucceeded: false})
      })
    )
  }
}
