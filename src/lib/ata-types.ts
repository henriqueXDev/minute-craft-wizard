export type Participante = { nome: string; orgao: string; email: string };
export type RelatoItem = { rotulo: string; texto: string };
export type RelatoTopico = { titulo: string; itens: RelatoItem[] };
export type Encaminhamento = { tarefa: string; prazo: string; responsavel: string; situacao: string };

export type Ata = {
  titulo: string;
  numeroAta: string;
  solicitante: string;
  elaboracao: string;
  data: string;
  inicio: string;
  termino: string;
  local: string;
  participantes: Participante[];
  pauta: string[];
  relato: RelatoTopico[];
  encaminhamentos: Encaminhamento[];
};

const str = { type: "string" } as const;

export const ataSchema = {
  type: "object",
  additionalProperties: false,
  required: ["titulo", "numeroAta", "solicitante", "elaboracao", "data", "inicio", "termino", "local", "participantes", "pauta", "relato", "encaminhamentos"],
  properties: {
    titulo: str, numeroAta: str, solicitante: str, elaboracao: str, data: str, inicio: str, termino: str, local: str,
    participantes: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["nome", "orgao", "email"], properties: { nome: str, orgao: str, email: str } },
    },
    pauta: { type: "array", items: str },
    relato: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["titulo", "itens"],
        properties: {
          titulo: str,
          itens: { type: "array", items: { type: "object", additionalProperties: false, required: ["rotulo", "texto"], properties: { rotulo: str, texto: str } } },
        },
      },
    },
    encaminhamentos: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["tarefa", "prazo", "responsavel", "situacao"], properties: { tarefa: str, prazo: str, responsavel: str, situacao: str } },
    },
  },
};
