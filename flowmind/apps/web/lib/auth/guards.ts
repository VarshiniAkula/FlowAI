import 'server-only';

import { createSupabaseServerClient } from '../supabase/server';
import { createSupabaseServiceClient } from '../supabase/service';

/**
 * Shared authorization guards. These are the ONLY place server code should
 * check auth and role — do not scatter equivalent checks across routes.
 *
 * Each guard throws a GuardError with an error code matching spec section Q.
 */

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

const ROLE_RANK: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export type GuardCode =
  | 'UNAUTHENTICATED'
  | 'NOT_A_MEMBER'
  | 'INSUFFICIENT_ROLE'
  | 'NOT_FOUND';

export class GuardError extends Error {
  readonly code: GuardCode;
  readonly status: number;
  constructor(code: GuardCode, message: string) {
    super(message);
    this.code = code;
    this.status =
      code === 'UNAUTHENTICATED'
        ? 401
        : code === 'NOT_A_MEMBER' || code === 'INSUFFICIENT_ROLE'
          ? 403
          : 404;
  }
}

export interface AuthedUser {
  id: string;
  email: string | null;
}

/** Require an authenticated session. Throws UNAUTHENTICATED otherwise. */
export async function requireUser(): Promise<AuthedUser> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new GuardError('UNAUTHENTICATED', 'Sign in required.');
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Require the authenticated user to belong to `orgId`. Returns the user's
 * role in that org. Throws NOT_A_MEMBER otherwise.
 */
export async function requireOrgMember(orgId: string): Promise<{
  user: AuthedUser;
  role: Role;
}> {
  const user = await requireUser();
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !data) {
    throw new GuardError('NOT_A_MEMBER', 'Not a member of this organization.');
  }
  return { user, role: data.role as Role };
}

/**
 * Require role >= minRole in `orgId`. Owner > admin > member > viewer.
 */
export async function requireOrgRole(
  orgId: string,
  minRole: Role,
): Promise<{ user: AuthedUser; role: Role }> {
  const result = await requireOrgMember(orgId);
  if (ROLE_RANK[result.role] < ROLE_RANK[minRole]) {
    throw new GuardError(
      'INSUFFICIENT_ROLE',
      `Requires role '${minRole}' or higher.`,
    );
  }
  return result;
}

/**
 * Require role >= minRole on the org that owns `assistantId`. Resolves the
 * assistant's org server-side (never trust client-supplied org_id).
 */
export async function requireAssistantAccess(
  assistantId: string,
  minRole: Role,
): Promise<{ user: AuthedUser; role: Role; orgId: string }> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('assistants')
    .select('org_id')
    .eq('id', assistantId)
    .maybeSingle();
  if (error || !data) {
    throw new GuardError('NOT_FOUND', 'Assistant not found.');
  }
  const orgId = (data as { org_id: string }).org_id;
  const gated = await requireOrgRole(orgId, minRole);
  return { ...gated, orgId };
}
