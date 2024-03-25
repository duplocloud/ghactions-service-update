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

interface DockerEnv {
  [name: string]: string
}

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
  AllocationTags?: string

  // Completely replaces environment variables.
  Env?: DockerEnv | K8sEnvEntry[]

  // Merges on to of existing environment variables.
  MergeEnv?: DockerEnv | K8sEnvEntry[]

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
    const rq = this.buildUpdatePayload();

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

  buildUpdatePayload(): ReplicationControllerChangeRequest {
   const payload = new ReplicationControllerChangeRequest({
      Name: this.desired.Name,
      Image: this.desired.Image,
      AgentPlatform: this.desired.AgentPlatform,
      AllocationTags: this.desired.AllocationTags
    })
    if (!payload.AgentPlatform && payload.AgentPlatform !== 0) {
      payload.AgentPlatform = this.existing.Template.AgentPlatform
    }

    if (!payload.AllocationTags?.length) {
      payload.AllocationTags = this.existing.Template.AllocationTags
    }

    // Add environment variables to the change request.
    if (this.desired.Env || this.desired.MergeEnv || this.desired.DeleteEnv) {
      if (payload.AgentPlatform === AgentPlatform.EKS_LINUX) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const otherDockerConfig: any = this.existing.OtherDockerConfig || {}

        otherDockerConfig.Env = this.buildK8sEnv()

        payload.OtherDockerConfig = JSON.stringify(otherDockerConfig)
      } else {
        payload.ExtraConfig = JSON.stringify(this.buildDockerEnv())
      }
    }

    return payload;
  }

  private buildK8sEnv(): K8sEnvEntry[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const otherDockerConfig: any = this.existing.OtherDockerConfig || {}
    let env: K8sEnvEntry[] = otherDockerConfig.Env ?? []

    if (this.desired.Env) env = this.desired.Env as K8sEnvEntry[]

    if (Array.isArray(this.desired.MergeEnv)) {
      for (const mergeEntry of this.desired.MergeEnv) {
        const replace = env.find(entry => entry.Name === mergeEntry.Name)
        if (replace) Object.assign(replace, mergeEntry)
        else env.push(mergeEntry)
      }
    }

    if (this.desired.DeleteEnv && env?.length) env = env.filter(entry => !this.desired.DeleteEnv?.includes(entry.Name))

    return env
  }

  private buildDockerEnv(): DockerEnv {
    let env: DockerEnv = (this.existing.ExtraConfigAsJSON ?? {}) as DockerEnv

    if (this.desired.Env) env = this.desired.Env as DockerEnv

    if (this.desired.MergeEnv) {
      env ??= {}
      Object.assign(env, this.desired.MergeEnv)
    }

    if (this.desired.DeleteEnv) for (const key of this.desired.DeleteEnv) delete env[key]

    return env
  }
}

// Function to perform bulk Replication Controller Updates
export function bulkServiceUpdate(serviceUpdater: ServiceUpdater, payload: ReplicationControllerChangeRequest[]) {
  return serviceUpdater.ds.serviceBulkUpdate(serviceUpdater.tenant.TenantId, payload).pipe(
    map(rp => {
      core.info(`${ServiceUpdater.SUCCESS}: Services-Bulk-Update`)
      return { ImagePrev: undefined, Replicas: 0, Containers: [], UpdateSucceeded: rp ?? true }
    }),
    catchError(err => {
      core.error(`${ServiceUpdater.FAILURE}: Services-Bulk-Update: ${extractErrorMessage(err)}`)
      return of({ ImagePrev: 'Services-Bulk-Update', Replicas: 0, Containers: [], UpdateSucceeded: false })
    })
  )
}
