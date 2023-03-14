export type Require<Obj extends object, Keys extends keyof Obj> = NonNullable<
  Required<Pick<Obj, Keys>>
> &
  Omit<Obj, Keys>

export type Optional<Obj extends object, Keys extends keyof Obj> = Partial<
  Pick<Obj, Keys>
> &
  Omit<Obj, Keys>

export type Nullable<Obj extends object, Keys extends keyof Obj> = Omit<
  Obj,
  Keys
> & {
  [K in Keys]: Obj[K] | null
}
