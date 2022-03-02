/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-shadow */

// API object:  a key / value pair
export interface KeyStringValue {
  Key: string
  Value: string
}

export interface StringValue {
  Value: string
}

export interface Named {
  Name: string
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

// A request to patch an ECS service.
export class EcsServicePatchRequest {
  constructor(public Name: string, public Image: string) {}
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
  DockerId: string = ''
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

export class Pod {
  /** Convenience constructor for deserialization or cloning.  */
  constructor(properties?: Partial<Pod>) {
    Object.assign(this, properties || {})
  }

  CurrentStatus!: number
  CurrentNetworkStatus!: number
  DesiredStatus!: number
  Version?: string
  ReplicaId?: number
  InstanceId?: string
  Host?: string
  IsAwaitingLBDeregistration: boolean = false
  Name!: string
  Containers: PodContainer[] = []
  Interfaces: PodInterface[] = []
  UserAccount?: string
  AgentPlatform: AgentPlatform = AgentPlatform.DOCKER_LINUX
  Volumes?: string
  Commands: string[] = []

  ApplicationUrl?: string
  SecondaryTenant?: string
  ExtraConfig?: string
  OtherDockerConfig?: string
  OtherDockerHostConfig?: string
  DeviceIds: string[] = []
  BaseVersion?: string
  Cloud: CloudPlatform = CloudPlatform.AWS
  ImageUpdateTime?: Date
  IsReadOnly: boolean = false
  // LBConfigurations: {[key: string]: LBConfiguration}
  // LBCCount: number
  AllocationTags?: string

  get IsHealthy(): boolean {
    return this.CurrentStatus === this.DesiredStatus
  }

  get Image(): string {
    return this.Containers[0]?.Image
  }

  get DockerId(): string {
    return this.Containers[0]?.DockerId
  }
}
export class CapacityProviderStrategy {
  constructor(prop?: Partial<CapacityProviderStrategy>) {
    Object.assign(this, prop || {})
  }

  CapacityProvider?: string
  Base?: number
  Weight?: number
}

export class EcsTaskDefinitionArn {
  constructor(public TaskDefinitionArn: string) {}
}

export class EcsServiceModel {
  constructor(properties?: Partial<EcsServiceModel>) {
    Object.assign(this, properties || {})
  }

  Name!: string
  TaskDefinition!: string
  Replicas!: number
  IsTargetGroupOnly?: boolean
  HealthCheckGracePeriodSeconds?: number
  LBConfigurations?: LBConfiguration[]
  CapacityProviderStrategy?: CapacityProviderStrategy[]
  OldTaskDefinitionBufferSize?: number
  DnsPrfx?: string

  getServiceName(tenantName: string): string {
    return `duploservices-${tenantName}-${this.Name}`
  }
}

export enum LBType {
  Classic = 0,
  Application = 1,
  HealthCheck = 2,
  K8SClusterIP = 3,
  K8SNodePort = 4,
  NLB = 6
}

export class LbHealthCheckConfig {
  constructor(properties?: Partial<LbHealthCheckConfig>) {
    Object.assign(this, properties || {})
  }
  HealthyThresholdCount?: number
  UnhealthyThresholdCount?: number
  HealthCheckTimeoutSeconds?: number
  HealthCheckIntervalSeconds?: number
  HttpSuccessCode?: string
  GrpcSuccessCode?: string
}

export class LBConfiguration {
  constructor(prop?: Partial<LBConfiguration>) {
    Object.assign(this, prop || {})
  }

  ReplicationControllerName!: string
  Protocol!: string
  Port!: number
  DIPAddresses?: object[]
  HostPort?: number
  IsInfraDeployment?: boolean
  DnsName?: string
  CertificateArn?: string
  ExternalPort!: number
  IsInternal?: boolean
  CloudName?: string
  ForHealthCheck?: boolean
  HealthCheckUrl?: string
  IsNative?: boolean
  LbType!: LBType
  TgCount?: number
  ExternalTrafficPolicy?: string
  BeProtocolVersion?: string
  FrontendIp?: string
  HealthCheckConfig?: LbHealthCheckConfig

  get lbTypeString(): string {
    const lbTypeDesc = {0: 'Classic', 1: 'ALB', 2: 'Health Check', 3: 'K8S Cluster IP', 4: 'K8S Node Port', 6: 'NLB'}
    return lbTypeDesc[this.LbType]
  }

  get isCloudLB(): boolean {
    return this.LbType === LBType.Application || this.LbType === LBType.Classic
  }

  get isK8sOnly(): boolean {
    return this.LbType === LBType.K8SClusterIP || this.LbType === LBType.K8SNodePort
  }
}

export class EcsTaskDefinition {
  constructor(properties?: Partial<EcsTaskDefinition>) {
    Object.assign(this, properties || {})
  }

  Compatibilities?: string[]
  ContainerDefinitions!: ContainerDefinition[]
  Cpu?: string
  DeregisteredAt?: string
  ExecutionRoleArn?: string
  Family!: string
  InferenceAccelerators?: any[]
  Memory?: string
  NetworkMode?: StringValue
  PlacementConstraints?: any[]
  RegisteredAt?: string
  RegisteredBy?: string
  RequiresAttributes?: Named[]
  RequiresCompatibilities?: string[]
  Revision!: number
  Status?: StringValue
  TaskDefinitionArn!: string
  TaskRoleArn?: string
  Volumes?: any[]
}

export class ContainerDefinition {
  constructor(properties?: Partial<ContainerDefinition>) {
    Object.assign(this, properties || {})
  }

  Command!: string[]
  Cpu?: number
  DependsOn?: string[]
  DisableNetworking?: boolean
  DnsSearchDomains?: string[]
  DnsServers?: string[]
  DockerLabels?: any
  DockerSecurityOptions?: any[]
  EntryPoint?: string[]
  Environment?: Environment[]
  EnvironmentFiles?: any[]
  Essential?: boolean
  ExtraHosts?: string[]
  Image!: string
  Interactive?: boolean
  Links?: any[]
  LinuxParameters?: LinuxParameters
  Memory?: number
  MemoryReservation?: number
  HealthCheck?: any
  MountPoints?: any[]
  Name: string = 'default'
  PortMappings?: PortMapping[]
  Privileged?: boolean
  PseudoTerminal?: boolean
  ReadonlyRootFilesystem?: boolean
  ResourceRequirements?: any[]
  Secrets?: any[]
  StartTimeout?: number
  StopTimeout?: number
  SystemControls?: any[]
  Ulimits?: any[]
  VolumesFrom?: any[]
}

export class Environment {
  constructor(properties?: Partial<Environment>) {
    Object.assign(this, properties || {})
  }
  Name!: string
  Value!: string
}

export class LinuxParameters {
  constructor(properties?: Partial<LinuxParameters>) {
    Object.assign(this, properties || {})
  }
  Devices?: any[]
  InitProcessEnabled?: boolean
  MaxSwap?: number
  SharedMemorySize?: number
  Swappiness?: number
  Tmpfs?: any[]
}

export class PortMapping {
  constructor(properties?: Partial<PortMapping>) {
    Object.assign(this, properties || {})
  }
  ContainerPort!: number
  HostPort?: number
  Protocol?: StringValue
}
