import type { ComponentType } from 'react'
import AfroBack, { AfroFloor } from './afro'
import type { DecorKind } from './decorKind'
import ElectroBack, { ElectroFloor } from './electro'
import FrenchBack, { FrenchWall } from './french'
import JazzBack, { JazzFloor, JazzWall } from './jazz'
import LofiBack, { LofiFloor } from './lofi'
import RapBack, { RapFloor, RapWall } from './rap'
import RockBack, { RockFloor } from './rock'
import type { DecorProps } from './zones'
import './decor.css'
import './decorPalettes.css'

/** The projectors of the generic club: all four, softer, crossed, only the outer two, or none (a calm room). */
export type BeamMode = 'standard' | 'soft' | 'crossed' | 'outer' | 'none'

export interface DecorSpec {
  beams: BeamMode
  /** The thin vertical slats of the generic wall; false when the decor paints its own wall. */
  slats: boolean
  /** The grid of the floor in perspective. */
  grid: boolean
  /** Over the plain wall, instead of the slats when `slats` is false. */
  Wall?: ComponentType<DecorProps>
  /** Behind the beams, the screen, the speakers and the stage. */
  Back: ComponentType<DecorProps>
  /** On the floor, behind the stage and the crowd. */
  Floor?: ComponentType<DecorProps>
}

/** What each genre draws, in the room and on the entry screen. The card of the list has its own drawings (RoomCardScene). */
export const DECORS: Record<DecorKind, DecorSpec> = {
  lofi: { beams: 'none', slats: true, grid: true, Back: LofiBack, Floor: LofiFloor },
  rock: { beams: 'crossed', slats: true, grid: true, Back: RockBack, Floor: RockFloor },
  electro: { beams: 'none', slats: true, grid: true, Back: ElectroBack, Floor: ElectroFloor },
  jazz: { beams: 'none', slats: false, grid: true, Wall: JazzWall, Back: JazzBack, Floor: JazzFloor },
  rap: { beams: 'outer', slats: false, grid: true, Wall: RapWall, Back: RapBack, Floor: RapFloor },
  afro: { beams: 'none', slats: false, grid: false, Back: AfroBack, Floor: AfroFloor },
  french: { beams: 'soft', slats: false, grid: true, Wall: FrenchWall, Back: FrenchBack },
}
