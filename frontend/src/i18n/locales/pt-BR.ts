import type { Messages } from './en';

/**
 * Português do Brasil. Mesmas chaves do inglês (en.ts); o typecheck acusa
 * uma chave faltando ou sobrando. Termos de regra seguem as edições
 * brasileiras de cada sistema.
 */
const ptBR: Messages = {
  common: {
    loading: 'Carregando...',
    tryAgain: 'Tentar de novo',
    or: 'ou',
  },

  roles: {
    GM: 'Mestre',
    PLAYER: 'Jogador',
    SPECTATOR: 'Espectador',
  },

  passwordRules: {
    heading: 'Requisitos da senha',
    length: 'Pelo menos 12 caracteres',
    upper: 'Uma letra maiúscula',
    lower: 'Uma letra minúscula',
    number: 'Um número',
    special: 'Um caractere especial, como ! @ # $ %',
  },

  login: {
    title: 'Bem-vindo de volta',
    subtitle: 'Entrar em {{instance}}',
    email: 'E-mail',
    emailPlaceholder: 'seu@email.com',
    password: 'Senha',
    passwordPlaceholder: 'Digite sua senha',
    rememberMe: 'Manter conectado',
    forgotPassword: 'Esqueceu a senha?',
    submit: 'Entrar',
    submitting: 'Entrando...',
    noAccount: 'Ainda não tem conta?',
    createAccount: 'Criar uma',
    errors: {
      emailRequired: 'Informe o e-mail',
      emailInvalid: 'Informe um e-mail válido',
      passwordRequired: 'Informe a senha',
      tooManyAttempts: 'Muitas tentativas de entrar. Tente de novo mais tarde.',
      invalidCredentials: 'E-mail ou senha incorretos',
      generic: 'Algo deu errado ao entrar. Tente de novo.',
    },
  },

  changePassword: {
    title: 'Escolha sua senha',
    welcome: 'Olá, {{name}}.',
    intro: 'Sua conta foi criada com uma senha temporária. Escolha a sua para continuar; quem criou a conta não consegue ver a nova senha.',
    current: 'Senha temporária',
    new: 'Nova senha',
    confirm: 'Confirme a nova senha',
    submit: 'Salvar senha e continuar',
    saving: 'Salvando...',
    signOut: 'Sair sem trocar',
    errors: {
      currentRequired: 'Digite a senha com que você acabou de entrar',
      passwordRequired: 'Informe a nova senha',
      requirementsNotMet: 'A senha não atende aos requisitos',
      sameAsCurrent: 'A nova senha precisa ser diferente da atual',
      confirmRequired: 'Confirme a senha',
      mismatch: 'As senhas não coincidem',
      generic: 'Não foi possível trocar a senha. Tente de novo.',
    },
  },

  dashboard: {
    welcome: 'Bem-vindo de volta, {{name}}',
    admin: 'Admin',
    adminLabel: 'Abrir o painel de administração',
    logout: 'Sair',
    logoutLabel: 'Sair da conta',
    profileLabel: 'Ver o perfil de {{name}}',
    yourAccount: 'sua conta',
    loadFailed: 'Não foi possível carregar os dados',
    campaignCreated: 'Campanha "{{name}}" criada!',
    characters: {
      title: 'Seus personagens',
      count_one: '{{count}} personagem',
      count_other: '{{count}} personagens',
      manage: 'Gerenciar',
      more: 'E mais {{count}}...',
      none: 'Nenhum personagem ainda',
      create: 'Criar personagem',
    },
    assets: {
      title: 'Biblioteca de arquivos',
      subtitle: 'Mapas, tokens e mais',
      open: 'Abrir biblioteca',
      cardTitle: 'Organize seus arquivos',
      cardText: 'Envie e organize mapas, tokens, áudios e imagens de avatar',
    },
    documents: {
      title: 'Documentos',
      subtitle: 'Livros de regras e materiais',
      open: 'Ver documentos',
      cardTitle: 'Leia sem sair da mesa',
      cardText: 'Envie um PDF, texto ou Markdown e leia aqui, ou em qualquer campanha com que o mestre compartilhar',
    },
    templates: {
      title: 'Modelos de ficha',
      subtitle: 'Fichas iniciais compartilhadas',
      open: 'Ver modelos',
      cardTitle: 'Comece de um modelo',
      cardText: 'Copie uma ficha compartilhada para um personagem, ou publique uma para os outros',
    },
    invitations: {
      title: 'Convites pendentes',
      count_one: 'Você tem {{count}} convite para campanha',
      count_other: 'Você tem {{count}} convites para campanhas',
      view: 'Ver convite →',
    },
    campaigns: {
      title: 'Suas campanhas',
      import: 'Importar',
      create: 'Criar campanha',
      emptyTitle: 'Nenhuma campanha ainda',
      emptyJoinLead: 'Vai entrar num jogo?',
      emptyJoin: 'Peça ao seu mestre para convidar você. O convite aparece nesta página, pronto para aceitar.',
      emptyRunLead: 'Vai mestrar?',
      emptyRun: 'Crie uma campanha. Como mestre, você convida os jogadores, cria mapas e conduz as sessões.',
      emptyCreate: 'Criar uma campanha',
    },
    stats: {
      title: 'Resumo',
      asGm: 'Campanhas como mestre',
      asPlayer: 'Campanhas como jogador',
      active: 'Campanhas ativas',
    },
  },

  campaignCard: {
    status: {
      PREPARATION: 'Em preparação',
      ACTIVE: 'Ativa',
      PAUSED: 'Pausada',
      COMPLETED: 'Concluída',
      ARCHIVED: 'Arquivada',
      INACTIVE: 'Inativa',
    },
    owner: 'Dono:',
    members: 'Membros:',
    lastPlayed: 'Última sessão:',
    when: {
      never: 'Nunca',
      today: 'Hoje',
      yesterday: 'Ontem',
      daysAgo: 'Há {{count}} dias',
      weeksAgo: 'Há {{count}} semanas',
      monthsAgo: 'Há {{count}} meses',
      yearsAgo: 'Há {{count}} anos',
    },
  },
};

export default ptBR;
