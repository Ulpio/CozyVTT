/**
 * English text: the reference every other language follows key for key.
 * Grouped by screen; `common` holds what several screens share.
 */
const en = {
  common: {
    loading: 'Loading...',
    tryAgain: 'Try Again',
    or: 'or',
  },

  roles: {
    GM: 'GM',
    PLAYER: 'Player',
    SPECTATOR: 'Spectator',
  },

  passwordRules: {
    heading: 'Password requirements',
    length: 'At least 12 characters',
    upper: 'One uppercase letter',
    lower: 'One lowercase letter',
    number: 'One number',
    special: 'One special character, such as ! @ # $ %',
  },

  login: {
    title: 'Welcome Back',
    subtitle: 'Sign in to {{instance}}',
    email: 'Email',
    emailPlaceholder: 'your@email.com',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    rememberMe: 'Remember me',
    forgotPassword: 'Forgot password?',
    submit: 'Sign In',
    submitting: 'Signing in...',
    noAccount: "Don't have an account?",
    createAccount: 'Create one',
    errors: {
      emailRequired: 'Email is required',
      emailInvalid: 'Please enter a valid email address',
      passwordRequired: 'Password is required',
      tooManyAttempts: 'Too many login attempts. Please try again later.',
      invalidCredentials: 'Invalid email or password',
      generic: 'An error occurred during login. Please try again.',
    },
  },

  changePassword: {
    title: 'Choose your password',
    welcome: 'Welcome, {{name}}.',
    intro: "Your account was set up with a temporary password. Pick your own to continue — whoever created the account can't see this one.",
    current: 'Temporary password',
    new: 'New password',
    confirm: 'Confirm new password',
    submit: 'Set Password and Continue',
    saving: 'Saving...',
    signOut: 'Sign out instead',
    errors: {
      currentRequired: 'Enter the password you just signed in with',
      passwordRequired: 'Password is required',
      requirementsNotMet: 'Password does not meet requirements',
      sameAsCurrent: 'New password must differ from your current one',
      confirmRequired: 'Please confirm your password',
      mismatch: 'Passwords do not match',
      generic: 'Failed to change password. Please try again.',
    },
  },

  dashboard: {
    welcome: 'Welcome back, {{name}}',
    admin: 'Admin',
    adminLabel: 'Go to Admin Panel',
    logout: 'Logout',
    logoutLabel: 'Log out of CozyVTT',
    profileLabel: 'View profile for {{name}}',
    yourAccount: 'your account',
    loadFailed: 'Failed to load data',
    campaignCreated: 'Campaign "{{name}}" created!',
    characters: {
      title: 'Your Characters',
      count_one: '{{count}} character',
      count_other: '{{count}} characters',
      manage: 'Manage',
      more: 'And {{count}} more...',
      none: 'No characters yet',
      create: 'Create Character',
    },
    assets: {
      title: 'Asset Library',
      subtitle: 'Maps, tokens, and more',
      open: 'View Library',
      cardTitle: 'Manage Your Assets',
      cardText: 'Upload and organize maps, tokens, audio, and avatar images',
    },
    documents: {
      title: 'Documents',
      subtitle: 'Rulebooks and handouts',
      open: 'View Documents',
      cardTitle: 'Read Without Leaving the Table',
      cardText: 'Upload a PDF, text or Markdown file and read it here or in any campaign a GM shares it with',
    },
    templates: {
      title: 'Character Templates',
      subtitle: 'Shared starter sheets',
      open: 'Browse',
      cardTitle: 'Start From a Template',
      cardText: 'Copy a shared sheet into a character, or publish one for others',
    },
    invitations: {
      title: 'Pending Invitations',
      count_one: 'You have {{count}} pending campaign invitation',
      count_other: 'You have {{count}} pending campaign invitations',
      view: 'View Invitation →',
    },
    campaigns: {
      title: 'Your Campaigns',
      import: 'Import',
      create: 'Create Campaign',
      emptyTitle: 'No campaigns yet',
      emptyJoinLead: 'Joining a game?',
      emptyJoin: 'Ask your game master to invite you. The invitation appears on this page, ready to accept.',
      emptyRunLead: 'Running one yourself?',
      emptyRun: "Create a campaign. As its game master (GM), you'll be able to invite players, create maps, and manage game sessions.",
      emptyCreate: 'Create a Campaign',
    },
    stats: {
      title: 'Quick Stats',
      asGm: 'Campaigns as GM',
      asPlayer: 'Campaigns as Player',
      active: 'Active Campaigns',
    },
  },

  campaignCard: {
    status: {
      PREPARATION: 'Preparation',
      ACTIVE: 'Active',
      PAUSED: 'Paused',
      COMPLETED: 'Completed',
      ARCHIVED: 'Archived',
      INACTIVE: 'Inactive',
    },
    owner: 'Owner:',
    members: 'Members:',
    lastPlayed: 'Last played:',
    when: {
      never: 'Never',
      today: 'Today',
      yesterday: 'Yesterday',
      daysAgo: '{{count}} days ago',
      weeksAgo: '{{count}} weeks ago',
      monthsAgo: '{{count}} months ago',
      yearsAgo: '{{count}} years ago',
    },
  },
};

export default en;
export type Messages = typeof en;
