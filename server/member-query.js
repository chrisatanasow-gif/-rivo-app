// Reuse the tested ride state machine against physically separate member tables.
// Only fixed, server-owned SQL passes here; no client SQL or table names.
export const memberQuery = query => (statement, parameters) => query(statement.replace(/\brivo_pilot_(sessions|rides|quotes)\b/g, "rivo_member_$1"), parameters);
