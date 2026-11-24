/** An id the URL and the Registry can carry as is: non-empty, no whitespace, none of `? # & /`. */
export const isIdShape = (id: unknown): id is string => typeof id === 'string' && /^[^\s?#&/]+$/.test(id);
/** `<namespace>:<action>`, each part an id shape without `:`. */
export const isPermissionShape = (value: unknown): value is string => typeof value === 'string' && /^[^\s:?#&/]+:[^\s:?#&/]+$/.test(value);

/** An identifier in the open object-kind namespace. */
export const isObjectKindShape = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-zA-Z0-9]*$/.test(value);
