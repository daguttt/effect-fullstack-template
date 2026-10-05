export function getUserDisplayName(
  firstName: string | null,
  lastName: string | null
) {
  const hasFullName = Boolean(firstName) && Boolean(lastName);
  if (hasFullName) {
    return `${firstName} ${lastName}`;
  }

  return firstName || lastName || 'Signed in';
}
