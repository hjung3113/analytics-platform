export function routedBundle() {
  return {
    endpoints: [{
      id: 'syn.rows', menuId: 'syn', paramKeys: ['q'], permission: 'syn:view', requiresScope: true,
      context: { time: 'apply' }, mergeTimeDomain: false, limits: { maxRows: 100 },
      paramTypes: { q: { type: 'string', maxLength: 20 } }, kinds: ['coverage'],
    }],
    actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }],
    targets: { 'tgt-1': { kind: 'sql', dialect: 'postgres', connectionFile: '/secrets/syn-db' } },
    endpointOwners: { 'syn.rows': {
      unroutedRooms: 'error',
      routes: [{ sites: ['SITE-A'], rooms: ['RA1'], targets: ['tgt-1'] }],
      call: { statement: 'SELECT * FROM syn.rows WHERE room = :rooms AND q = :q', params: { rooms: 'scope.rooms', q: 'params.q' } },
      scopeCheck: { mode: 'verify-rows', roomField: '/room' },
    } },
  };
}

