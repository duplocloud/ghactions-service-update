import * as core from '@actions/core'
import {
  ContainerDefinition,
  EcsServiceModel,
  EcsServicePatchRequest,
  EcsTaskDefinition,
  EcsTaskDefinitionArn,
  UserTenant
} from './duplocloud/model'
import {DataSource, extractErrorMessage} from './duplocloud/datasource'
import {Observable, of} from 'rxjs'
import {catchError, map, mergeMap} from 'rxjs/operators'

export interface EcsServicePatchResult {
  UpdateSucceeded: boolean // did the update API succeed?
  ImagePrev?: string // what was the docker image prior to the API call?
  TaskDefinitionArn?: string // what was the docker image prior to the API call?
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
          return desiredContainer
        })
        this.sanitizeTaskDef(desiredTaskDef)

        // Build the API call and prepare to output status about the API call
        return this.ds.updateEcsTaskDefinition(this.tenant.TenantId, desiredTaskDef).pipe(
          mergeMap(TaskDefinitionArn => {
            core.info(`Updated ECS task definition: ${this.desired.Name}: ${TaskDefinitionArn}`)

            // Patch the ECS service, replacing the task definition.
            const desiredService = new EcsServiceModel(this.existingService)
            desiredService.TaskDefinition = TaskDefinitionArn
            return this.ds.updateEcsService(this.tenant.TenantId, desiredService).pipe(
              map(() => {
                core.info(`Updated ECS service: ${this.desired.Name}`)
                return {ImagePrev, TaskDefinitionArn, UpdateSucceeded: true}
              }),
              catchError(err => {
                core.error(`Failed to update ECS service: ${JSON.stringify(err)}`)
                return of({ImagePrev, TaskDefinitionArn, UpdateSucceeded: false})
              })
            )
          }),
          catchError(err => {
            const msg = extractErrorMessage(err)
            core.error(`Failed to update ECS task definition: ${msg}`)
            return of({ImagePrev, UpdateSucceeded: false})
          })
        )
      }),
      catchError(err => {
        core.error(`Failed to find ECS task definition: ${JSON.stringify(err)}`)
        return of({UpdateSucceeded: false})
      })
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private removeEmptyKeys(obj: any): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newObj: any = {}

    for (const key of Object.keys(obj)) {
      if (obj[key] && Array.isArray(obj[key])) {
        if (obj[key].length) {
          newObj[key] = obj[key]
        }
      } else if (obj[key] && typeof obj[key] === 'object') {
        if (Object.keys(obj[key]).length) {
          newObj[key] = obj[key]
        }
      } else if (obj[key]) {
        newObj[key] = obj[key] // copy value
      }
    }

    return newObj
  }

  private sanitizeTaskDef(taskDef: EcsTaskDefinition): void {
    this.removeEmptyKeys(taskDef)
    taskDef.ContainerDefinitions = taskDef.ContainerDefinitions.map(cnt => this.removeEmptyKeys(cnt))

    delete taskDef.DeregisteredAt
    delete taskDef.RegisteredAt
    delete taskDef.RegisteredBy
    delete taskDef.Revision
    delete taskDef.Status
    delete taskDef.TaskDefinitionArn
  }
}
