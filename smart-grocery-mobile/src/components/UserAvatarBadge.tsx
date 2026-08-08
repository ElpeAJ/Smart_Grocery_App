import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

type Props = {
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
  style?: ViewStyle;
};

function getInitials(fullName?: string | null, email?: string | null) {
  const safeName = fullName?.trim();
  if (safeName) {
    const parts = safeName.split(/\s+/).filter(Boolean);
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  return (email?.trim()?.[0] ?? 'U').toUpperCase();
}

function toRoleLabel(role?: string | null) {
  if (!role) {
    return 'User';
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function UserAvatarBadge({ fullName, email, role, style }: Props) {
  const initials = getInitials(fullName, email);
  const displayName = fullName?.trim() || email?.trim() || 'SmartGrocery User';

  return (
    <View style={[styles.container, style]}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarInitials}>{initials}</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.role}>{toRoleLabel(role)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: '78%',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E2FBE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#166534',
    fontSize: 15,
    fontWeight: '800',
  },
  textWrap: {
    flexShrink: 1,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  role: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '600',
  },
});
