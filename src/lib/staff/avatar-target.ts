/**
 * Resolve the right avatar API endpoint for an employee row.
 *
 * When `Employee.dispatcherId` FK is set, edits flow through the dispatcher's
 * avatar API so the displayed photo (`dispatcherAvatarUrl ?? avatarUrl`) and
 * the persisted record stay in sync — what the user sees is what they edit.
 *
 * Otherwise edits write to `Employee.avatarUrl` via the employee avatar API.
 */
export interface AvatarTarget {
  apiBasePath: string;
  subjectId: string;
}

export function selectAvatarTarget(opts: {
  employeeId: string;
  dispatcherId: string | null;
}): AvatarTarget {
  if (opts.dispatcherId) {
    return {
      apiBasePath: `/api/staff/${opts.dispatcherId}/avatar`,
      subjectId: opts.dispatcherId,
    };
  }
  return {
    apiBasePath: `/api/employees/${opts.employeeId}/avatar`,
    subjectId: opts.employeeId,
  };
}
