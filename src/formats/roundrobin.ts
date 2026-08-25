import type { Phase } from "../phase"

export interface RoundRobinFormat extends Phase {
  readonly type: "roundrobin"
}
