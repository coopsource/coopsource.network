export {
  MEMBERS_SPACE_SKEY,
  MEMBERS_SPACE_TYPE,
  ROLE_SPACE_TYPE,
  membersSpace,
  parseCsnSpace,
  roleSpace,
} from './space-ref.js';
export type { CsnSpace } from './space-ref.js';
export type { CsnDbGroupAuthorityPortOptions } from './csn-db-group-authority-port.js';
export { CsnDbGroupAuthorityPort } from './csn-db-group-authority-port.js';
export type {
  AddMemberArgs,
  CsnDbGroupAuthorityCommandPortOptions,
  GroupAuthorityAuditEvent,
  GroupAuthorityAuditPage,
  GroupAuthorityCommandPort,
  GroupAuthorityCommandResult,
  GroupAuthorityFailureReason,
  GroupAuthorityOperation,
  ProvisionCooperativeAuthorityResult,
} from './group-authority-command-port.js';
export { CsnDbGroupAuthorityCommandPort } from './group-authority-command-port.js';
