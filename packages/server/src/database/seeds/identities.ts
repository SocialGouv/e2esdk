/**
 * Generated with:
 * pnpm generate identity --userId alice  --mainKey jcef-s6GavZu_Pge5MzQW7e1R_kLgIYLTbCtTi0X8uA --deviceId be46ae93-ed96-408b-ab78-73188b47c46d --deviceSecret 7wr2X4EBz_LKWoeMwjPcQPd4IVeFzcuaG1Kd36HD-C8
 * pnpm generate identity --userId bob    --mainKey 7d-0d8n5DDHbCpA46pGVbz9_Fdy3QEDC9AuPBbloygM --deviceId e7a0f071-5edf-484c-8868-6ba12f87a69c --deviceSecret EZRT0SkrW9dvTY445y4h_xEu--83320M8Gy0imM4ZH8
 * pnpm generate identity --userId carol  --mainKey IihRh3WbEp8rPxC13WjPNC2Droqqc20Zv45O_4eqerQ --deviceId 4c81170c-abd2-45ab-b7e4-463690d9db2d --deviceSecret 26WjG4jlKQ-Hs9OjB6ia5SBFvbJQntV5muRghu1J92I
 * pnpm generate identity --userId daniel --mainKey bkpg1y2AvkGP-M7P44YGm7ZWUexRSBR9qoYgYAGaW4Y --deviceId cc9f83b4-f550-497e-8922-96cbf976fdc3 --deviceSecret FOI_uwAsBpXZOZKfgdzVcrkt7ce-YL8R9avFJ65-x1Q
 */

export const SEED_USERS = [
  {
    mainKey: 'jcef-s6GavZu_Pge5MzQW7e1R_kLgIYLTbCtTi0X8uA',
    keychainBaseKey: 'KFiLNV_9Ikur9Toyb23CVBjhJmnsJxeT4BxtqRXIpgA',
    deviceRegistrationURI:
      'e2esdk://register-device?userId=alice&deviceId=be46ae93-ed96-408b-ab78-73188b47c46d&deviceSecret=7wr2X4EBz_LKWoeMwjPcQPd4IVeFzcuaG1Kd36HD-C8',
    identity: {
      userId: 'alice',
      sharingPublicKey: '62PV0lAmVeVhcAZRRHUaAioMYiRyXCBwR2-r_pQQPzo',
      signaturePublicKey: '0R--Iu1SEe4NTGqgZpHuHcxDac1GRHhcoHQiafHkMI8',
      proof:
        'LXKtsmw-VvYtkL9DowNM9eaS4RnZSEwipEfFK3feWAZqlZ6vdfEfYidRokj9D7UyYJd1nz9ED8q0k-DfsDLkCQ',
    },
    device: {
      id: 'be46ae93-ed96-408b-ab78-73188b47c46d',
      ownerId: 'alice',
      enrolledFrom: null,
      label: null,
      wrappedMainKey:
        'v1.secretBox.bin.zSUdMiFkBjbngs2imqKzfiVHDuK-ANFI.GqYUL8XyRtckudIylIv0s2oJ3lEF8O4GuzblmkHskdXClllsfWipMBtMmefpYBdh',
      opaqueCredentials:
        'VvEbdK7PI8NrBPZ0asoOF4aT6CwYIQrEkPNnaHX3DkedUZYUpn42hNj-fkHhCAgU835SykcGYZ0WUoyXJ3_u7r2DWqHCgtbXAfVk8J8ZfxAvumxsG2-DIle1GFmiX_Ur5VPUEv8QX3X9wJu0y6xkAsQsIB5aPhRpNH6CsvLeWsYbcXPf0ANwQPvmujJELoIBf9hFiHwI8FdSKEvqHpagD5xjcgv_3xjRFSWkMhNSv9nkRkdx8BVgoAQV5xXKjA7L',
    },
  },
  {
    mainKey: '7d-0d8n5DDHbCpA46pGVbz9_Fdy3QEDC9AuPBbloygM',
    keychainBaseKey: 'vslE3yRI3DCteGogEv-22q9cfwUkKiBvQgVpFtMDfYA',
    deviceRegistrationURI:
      'e2esdk://register-device?userId=bob&deviceId=e7a0f071-5edf-484c-8868-6ba12f87a69c&deviceSecret=EZRT0SkrW9dvTY445y4h_xEu--83320M8Gy0imM4ZH8',
    identity: {
      userId: 'bob',
      sharingPublicKey: 'dRR6RHSlP4zCAXq64ruXSKFwFYjqlVxQbimPovyc2iU',
      signaturePublicKey: 'JrDA7sc3AOIhH4rXwEUB0denU-QadXk-heSdYzIyAVg',
      proof:
        'OJIbHYKU0jqUPONJghgzLhhoVXrIA_QodT-GKuSU8r55iHE4L0aGcgwPDZSi1stA4oXnvcsAmHm9_oHk8z2oDA',
    },
    device: {
      id: 'e7a0f071-5edf-484c-8868-6ba12f87a69c',
      ownerId: 'bob',
      enrolledFrom: null,
      label: null,
      wrappedMainKey:
        'v1.secretBox.bin.7zzKQUUw8QLTjLIDiLSukCkzcr4kV7js.Rzv3IcUcrlBxLnpZkJmSEJTFzX8Xb9PfHoVIXmWlgkBBsiDtwR1uySQLYneBHrU1',
      opaqueCredentials:
        'EBAQXTh0yLKX8ihFOb3NzUIkJ7uK0E0uH2rSgytGswnGMY_dkIVrp0AN50ddJHnLTS7tDWAnebTquYEszj2COo03ghCPcKkxp5X6D8x7LuS7O-hqMr_I8XZEmSqIp2xOVQTKrZ5u7jjace8qPVWv7DfpCL-K17FUj822JQjZlRhGyuhZN9BduyP9BHUVYiKZEnYVKgruExjIIR2rvw39POTfKeOGFIQqTPkuE3tvcPahiYp-LPvftv-3H6g2IiD8',
    },
  },
  {
    mainKey: 'IihRh3WbEp8rPxC13WjPNC2Droqqc20Zv45O_4eqerQ',
    keychainBaseKey: 'bfL9TFyuuEZkbCA0dqATsGIPAWTMeykLmkqhp-jsWW8',
    deviceRegistrationURI:
      'e2esdk://register-device?userId=carol&deviceId=4c81170c-abd2-45ab-b7e4-463690d9db2d&deviceSecret=26WjG4jlKQ-Hs9OjB6ia5SBFvbJQntV5muRghu1J92I',
    identity: {
      userId: 'carol',
      sharingPublicKey: 'i45EWyYkTfkHRbBwd1KwIUKXBZaGPsr09ZZl6eSiH34',
      signaturePublicKey: 'mvKuZH17J9lwWReUKJSKT85SMmgpIAkmRevn7rv5fqk',
      proof:
        'gFsSfJ6m3iMmM1TiuB2CGg0M-ysZVp0qiymn39YBobxDsBCvcCY5G-MIBKvarFgz40l2CpViTlVD9_ASHidGDQ',
    },
    device: {
      id: '4c81170c-abd2-45ab-b7e4-463690d9db2d',
      ownerId: 'carol',
      enrolledFrom: null,
      label: null,
      wrappedMainKey:
        'v1.secretBox.bin.DzDxL_3szd5tsEL0GAJx8UW8yOWeN8NS.MBqZwwAAKxMoqCsKWR2Zq-xwrF84VIRKkV0kLSAqk6-JyReoti-qbq4eniGRl_Jt',
      opaqueCredentials:
        'AKIhiQjrLG8lZJH0hCL_t-eT9ByraQLIZWvnnJrgpyUU8XgBbx7WbU6AGbAq2BQNebjknYB0YrPXTpbahZzVws7VJnXXHy1GoUL8udQKHDEdtt0BgzuGYk-Jxi4oK2etLITQNNoWVurU5x0wO_cQ1JtvAycsyKsc3mSxWlnE-mAsK1fkScZKpRqnf88j12IBihD1ZjeB7BTIaJ3xTEy644TVxox7ehKMamJzPypUaz8y7TTGHXdKa81eaGCAv3gH',
    },
  },
  {
    mainKey: 'bkpg1y2AvkGP-M7P44YGm7ZWUexRSBR9qoYgYAGaW4Y',
    keychainBaseKey: 'FTHtdqz7uejOfrMb5PzMMjMupKLPHZqy527TWlO4NXY',
    deviceRegistrationURI:
      'e2esdk://register-device?userId=daniel&deviceId=cc9f83b4-f550-497e-8922-96cbf976fdc3&deviceSecret=FOI_uwAsBpXZOZKfgdzVcrkt7ce-YL8R9avFJ65-x1Q',
    identity: {
      userId: 'daniel',
      sharingPublicKey: '5klv5Ik1M2ZuQxzbHO70XIJ1dqeQMdiS7Hl1C7nvzCQ',
      signaturePublicKey: 'Y6XiTKqLN-yOr6GhBw0VQESOrHNlIsqsQSDOAG7BRcY',
      proof:
        'K_bU2yIlgNVd52MPAPeT5NE4Q9uG-QLB4meUnPFYcLW9Cy5gFKHF0FPuLPtB2N89FFvmIZ1v0ENrJUFc-trVCA',
    },
    device: {
      id: 'cc9f83b4-f550-497e-8922-96cbf976fdc3',
      ownerId: 'daniel',
      enrolledFrom: null,
      label: null,
      wrappedMainKey:
        'v1.secretBox.bin.eLduFDkrnxybR5ufODKUcOQerFkkIBXz.IEJMBCnVDRUrscfYlksZiFpCJPQW2P0yeVM91Jqm-5lC0zsObKPDR6oVNKm9R6zs',
      opaqueCredentials:
        'jhoonV7Wq4W6MSdPPLHzZHyzOhlRY2CgdpCv1MVQxBxEj08odnbk2zuUJ2t0Rr5PAQ6TrMt6MPvpFBGy36x3AWLB_eFK3BVRaj77xGcYwbpBWun9FyCeuy6jU2nckZ5l56xlTj0_c0169bY0uYWgbvLm3GaD_J87tOLkYzBCPjGRnzSYFQePa5aU4JXsOhs0hc1a-9rYVokSJifKeETkDFmG4nS_J7bagpRiUAw37CYLlZ3pJ93Ge5A0XTUOK5PA',
    },
  },
]
