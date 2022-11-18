import postgres from 'postgres'

export const databaseConnectionOptions: postgres.Options<any> = {
  transform: postgres.camel,
  types: {
    // Keep dates as ISO-8601 strings (not as Date objects)
    // https://github.com/porsager/postgres/issues/161
    date: {
      // Those oid numbers can be found in the `pg_catalog.pg_type` table.
      to: 1184, // timestamptz
      from: [
        1082, // date
        1083, // time
        1114, // timestamp
        1184, // timestamptz
      ],
      serialize: (x: any) => x,
      parse: (x: any) => new Date(x).toISOString(),
    },
  },
}
