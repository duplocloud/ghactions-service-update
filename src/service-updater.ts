import * as core from '@actions/core'
import {Observable, of} from 'rxjs'
import {Pod, ReplicationController, ServicePatchRequest, UserTenant} from './duplocloud/model'
import {catchError, map} from 'rxjs/operators'
import {DataSource} from './duplocloud/datasource'

interface ServiceContainerStatus {
  DesiredStatus: number
  CurrentStatus: number
  DockerId: string
  FirstSeen: number // when did we first see this container? [new Date().getTime()]
}

export interface ServicePatchResult {
  UpdateSucceeded: boolean // did the update API succeed?
  ImagePrev: string | undefined // what was the docker image prior to the API call?
  Replicas: number // how many replicas?
  Containers: ServiceContainerStatus[] // what is the container status?
}

export class ServiceUpdater {
  readonly name: string

  constructor(
    readonly tenant: UserTenant,
    readonly desired: ServicePatchRequest,
    readonly existing: ReplicationController,
    readonly pods: Pod[],
    readonly ds: DataSource
  ) {
    this.name = desired.Name
  }

  buildServiceUpdate(): Observable<ServicePatchResult> {
    const ImagePrev = this.existing.Template?.Containers[0].Image
    const Replicas = this.existing.Replicas

    // Find all existing pods, and remember when we first saw them.
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

    // Pull in the agent platform, if it is missing.
    if (!this.desired.AgentPlatform && this.desired.AgentPlatform !== 0) {
      this.desired.AgentPlatform = this.existing.Template?.AgentPlatform
    }

    // Build the API call and prepare to output status about the API call
    return this.ds.patchService(this.tenant.TenantId, this.desired).pipe(
      map(rp => {
        core.info(`Updated duplo service: ${this.desired.Name}`)
        return {ImagePrev, Replicas, Containers, UpdateSucceeded: rp ?? true}
      }),
      catchError(err => {
        core.error(`Failed to update Duplo service(s): ${JSON.stringify(err)}`)
        return of({ImagePrev, Replicas, Containers, UpdateSucceeded: false})
      })
    )
  }
}
