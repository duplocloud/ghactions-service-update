import * as core from '@actions/core'
import {
  AgentPlatform,
  K8sEnvEntry,
  Pod,
  ReplicationController,
  ReplicationControllerChangeRequest,
  UserTenant
} from './duplocloud/model'
import {DataSource, extractErrorMessage} from './duplocloud/datasource'
import {Observable, of} from 'rxjs'
import {catchError, map} from 'rxjs/operators'

interface ServiceContainerStatus {
  DesiredStatus: number
  CurrentStatus: number
  DockerId: string
  FirstSeen: number // when did we first see this container? [new Date().getTime()]
}

export class ServiceUpdateRequest {
  constructor(properties?: Partial<ServiceUpdateRequest>) {
    Object.assign(this, properties || {})
  }

  Name!: string
  Image!: string
  AgentPlatform?: AgentPlatform

  // Completely replaces environment variables.
  Env?: {[name: string]: string} | K8sEnvEntry

  // Merges on to of existing environment variables.
  MergeEnv?: {[name: string]: string} | K8sEnvEntry

  // Deletes the named environment variables.
  DeleteEnv?: string[]
}

export interface ServicePatchResult {
  UpdateSucceeded: boolean // did the update API succeed?
  ImagePrev: string | undefined // what was the docker image prior to the API call?
  Replicas: number // how many replicas?
  Containers: ServiceContainerStatus[] // what is the container status?
}

export class ServiceUpdater {
  static readonly SUCCESS = 'Updated Duplo service'
  static readonly FAILURE = 'Failed to update Duplo service'

  readonly name: string

  constructor(
    readonly tenant: UserTenant,
    readonly desired: ServiceUpdateRequest,
    readonly existing: ReplicationController,
    readonly pods: Pod[],
    readonly ds: DataSource
  ) {
    if (!desired?.Name?.length) throw new Error('service.Name: missing or empty')
    if (!desired?.Image?.length) throw new Error('service.Image: missing or empty')

    this.name = desired.Name
  }

  buildServiceUpdate(): Observable<ServicePatchResult> {
    // Collect data about the existing service and pods.
    const ImagePrev = this.existing.Template?.Containers[0].Image
    const Replicas = this.existing.Replicas
    const Containers: ServiceContainerStatus[] = this.pods
      .map(
        pod =>
          pod.Containers?.map(ctr => {
            return {
              DesiredStatus: pod.DesiredStatus,
              CurrentStatus: pod.CurrentStatus,
              DockerId: ctr.DockerId,
              FirstSeen: new Date().getTime()
            }
          }) ?? []
      )
      .flat()

    // Build the change request.
    const rq = new ReplicationControllerChangeRequest({
      Name: this.desired.Name,
      Image: this.desired.Image,
      AgentPlatform: this.desired.AgentPlatform
    })
    if (!rq.AgentPlatform && rq.AgentPlatform !== 0) {
      rq.AgentPlatform = this.existing.Template?.AgentPlatform as AgentPlatform
    }

    // Build the API call and prepare to output status about the API call
    return this.ds.patchService(this.tenant.TenantId, rq).pipe(
      map(rp => {
        core.info(`${ServiceUpdater.SUCCESS}: ${this.desired.Name}`)
        return {ImagePrev, Replicas, Containers, UpdateSucceeded: rp ?? true}
      }),
      catchError(err => {
        core.error(`${ServiceUpdater.FAILURE}: ${this.desired.Name}: ${extractErrorMessage(err)}`)
        return of({ImagePrev, Replicas, Containers, UpdateSucceeded: false})
      })
    )
  }
}
