export type Require<
  Object extends object,
  Keys extends keyof Object
> = NonNullable<Required<Pick<Object, Keys>>> & Omit<Object, Keys>

export type Optional<
  Object extends object,
  Keys extends keyof Object
> = Partial<Pick<Object, Keys>> & Omit<Object, Keys>

export type Nullable<Object extends object, Keys extends keyof Object> = Omit<
  Object,
  Keys
> & {
  [K in Keys]: Object[K] | null
}
