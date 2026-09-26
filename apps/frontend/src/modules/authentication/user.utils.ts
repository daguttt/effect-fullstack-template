export function getUserDisplayName(
  firstName: string | null,
  lastName: string | null
) {
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  return firstName || lastName || 'Signed in';
}
