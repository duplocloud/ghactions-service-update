/* eslint-disable no-shadow */
// API object:  a key / value pair
export interface KeyStringValue {
  Key: string
  Value: string
}

// API object:  custom data
export class CustomData implements KeyStringValue {
  constructor(properties?: Partial<CustomData>) {
    Object.assign(this, properties || {})
  }

  Key!: string
  Value!: string
}

// API object:  custom data with a type field
export class CustomDataEx extends CustomData {
  constructor(properties?: Partial<CustomDataEx>) {
    super()
    Object.assign(this, properties || {})
  }

  Type!: string
  ComponentId?: string
  State?: string
}

// API enum:  agent platform
export enum AgentPlatform {
  DOCKER_LINUX = 0,
  DOCKER_WINDOWS = 5,
  EKS_LINUX = 7,
  NONE = 8
}

// API enum:  cloud platform
export enum CloudPlatform {
  AWS = 0,
  Oracle = 1,
  Azure = 2,
  Google = 3,
  BYOH = 4,
  Unknown,
  Digital_Ocean
}

// API object: A tenant available to the currently logged-in user.
export class UserTenant {
  constructor(properties?: Partial<UserTenant>) {
    Object.assign(this, properties || {})
  }

  TenantId!: string
  AccountName!: string
  PlanID?: string
  Metadata?: CustomData[]
  InfraOwner?: string
}

// API object: A request to patch a service.
export class ServicePatchRequest {
  constructor(public Name: string, public Image: string, public AgentPlatform?: AgentPlatform) {}
}

export class ReplicationController {
  /** Convenience constructor for deserialization or cloning.  */
  constructor(properties?: Partial<ReplicationController>) {
    Object.assign(this, properties || {})
  }

  Name!: string
  Index?: number
  Template?: PodTemplate
  Replicas!: number
  ReplicasPrev?: number
  IsInfraDeployment?: boolean
  DnsPrfx?: string
  ElbDnsName?: string
  Fqdn?: string
  FqdnEx?: string
  ParentDomain?: string
  IsLBSyncedDeployment?: boolean
  IsReplicaCollocationAllowed?: boolean
  TenantId?: string
  ReplicasMatchingAsgName?: string
  IsDaemonset?: boolean
  Volumes?: string
  IsAnyHostAllowed?: boolean
  IsCloudCredsFromK8sServiceAccount?: boolean
  //Tags?: any[] // FIXME: Use a real type here

  get os(): string {
    const p = this.Template?.AgentPlatform
    return p === AgentPlatform.DOCKER_WINDOWS ? 'Windows' : 'Linux'
  }

  get cloud(): string | undefined {
    const c = this.Template?.Cloud
    return c ? CloudPlatform[c] : undefined
  }

  get Image(): string | undefined {
    return this.Template?.Containers[0]?.Image
  }

  get ExtraConfigAsJSON(): object | null {
    const e = this.Template?.ExtraConfig
    try {
      return e ? JSON.parse(e) : {}
    } catch (ex) {
      return null
    }
  }

  get OtherDockerConfig(): object | null {
    const d = this.Template?.OtherDockerConfig
    return d ? JSON.parse(d) : {}
  }
}

export class PodTemplate {
  /** Convenience constructor for deserialization or cloning.  */
  constructor(properties?: Partial<PodTemplate>) {
    Object.assign(this, properties || {})
  }

  Name!: string
  Containers!: PodContainer[]
  Interfaces?: PodInterface[]
  AgentPlatform!: AgentPlatform
  Volumes?: string
  Commands?: string[]
  ApplicationUrl?: string
  SecondaryTenant?: string
  ExtraConfig?: string
  OtherDockerConfig?: string
  OtherDockerHostConfig?: string
  DeviceIds?: string[]
  BaseVersion?: string
  LbConfigsVersion?: string
  Cloud?: CloudPlatform
  ImageUpdateTime?: string
  IsReadOnly?: boolean
  TenantId?: string
  LBCCount?: number
  AllocationTags?: string
}

export class PodContainer {
  constructor(properties?: Partial<PodContainer>) {
    Object.assign(this, properties || {})
  }
  Name!: string
  Image!: string
  TenantId?: string
  InstanceId?: string
  DockerId?: string
}

export class PodInterface {
  constructor(properties?: Partial<PodInterface>) {
    Object.assign(this, properties || {})
  }
  NetworkId!: string
  IpAddress?: string
  ExternalAddress?: string
  TenantId?: string
}
