import type { VaultPluginTemplate } from "@security-portal/shared";
import { z } from "zod";

export type FactoryChatLocale = "ko" | "en";
export type FactoryCatalogFilter = "all" | "auth" | "secret" | "database" | "partner" | "community" | "learning";
export type FactoryChatActionType =
  | "none"
  | "list"
  | "select"
  | "generate"
  | "generate-and-apply"
  | "apply"
  | "rollback";

export interface FactoryChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface FactoryChatContext {
  locale: FactoryChatLocale;
  messages: FactoryChatMessage[];
  selectedTemplateId?: string;
  generatedPluginName?: string;
}

export interface FactoryChatAction {
  type: FactoryChatActionType;
  templateId?: string;
  filter?: FactoryCatalogFilter;
}

export interface FactoryChatResult {
  reply: string;
  action: FactoryChatAction;
  provider: "ollama" | "rules";
  model?: string;
  fallbackReason?: "disabled" | "misconfigured" | "unavailable" | "invalid-response";
  latencyMs: number;
}

export interface FactoryAssistantHealth {
  ok: boolean;
  provider: "ollama" | "rules";
  model?: string;
  modelAvailable?: boolean;
  detail: string;
}

interface FactoryAssistantConfig {
  mode: "rules" | "ollama";
  baseUrl?: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

type FetchImplementation = typeof fetch;

const catalogFilters = ["all", "auth", "secret", "database", "partner", "community", "learning"] as const;

const modelActionSchema = z.object({
  type: z.enum(["none", "list", "select", "generate", "generate-and-apply", "apply", "rollback"]),
  templateId: z.string().nullable().optional(),
  filter: z.enum(catalogFilters).nullable().optional()
});

const modelReplySchema = z.object({
  reply: z.string().trim().min(1).max(8000),
  action: modelActionSchema
});

const ollamaReplyFormat = {
  type: "object",
  properties: {
    reply: { type: "string" },
    action: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["none", "list", "select", "generate", "generate-and-apply", "apply", "rollback"]
        },
        templateId: { type: ["string", "null"] },
        filter: { type: ["string", "null"], enum: [...catalogFilters, null] }
      },
      required: ["type", "templateId", "filter"],
      additionalProperties: false
    }
  },
  required: ["reply", "action"],
  additionalProperties: false
} as const;

export class FactoryAssistant {
  private readonly baseUrl?: string;

  constructor(
    private readonly config: FactoryAssistantConfig,
    private readonly templates: VaultPluginTemplate[],
    private readonly fetchImpl: FetchImplementation = fetch
  ) {
    this.baseUrl = config.baseUrl?.replace(/\/+$/, "");
  }

  async chat(context: FactoryChatContext): Promise<FactoryChatResult> {
    const startedAt = Date.now();
    if (this.config.mode !== "ollama") {
      return this.rulesReply(context, startedAt, "disabled");
    }
    if (!this.baseUrl || !this.config.apiKey) {
      return this.rulesReply(context, startedAt, "misconfigured");
    }

    let parsed: z.infer<typeof modelReplySchema> | undefined;
    try {
      parsed = await this.requestModel(context, false);
    } catch {
      return this.rulesReply(context, startedAt, "unavailable");
    }
    if (!parsed) {
      try {
        parsed = await this.requestModel(context, true);
      } catch {
        return this.rulesReply(context, startedAt, "invalid-response");
      }
    }
    return parsed
      ? this.validateModelReply(parsed, context, startedAt)
      : this.rulesReply(context, startedAt, "invalid-response");
  }

  async health(): Promise<FactoryAssistantHealth> {
    if (this.config.mode !== "ollama") {
      return { ok: true, provider: "rules", detail: "Rule-based fallback is active." };
    }
    if (!this.baseUrl || !this.config.apiKey) {
      return { ok: false, provider: "ollama", model: this.config.model, detail: "Ollama is not configured." };
    }

    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` }
      }, Math.min(this.config.timeoutMs, 5000));
      if (!response.ok) {
        return {
          ok: false,
          provider: "ollama",
          model: this.config.model,
          detail: `Ollama returned HTTP ${response.status}.`
        };
      }
      const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
      const modelAvailable = (body.models ?? []).some(
        (item) => item.name === this.config.model || item.model === this.config.model
      );
      return {
        ok: modelAvailable,
        provider: "ollama",
        model: this.config.model,
        modelAvailable,
        detail: modelAvailable ? "Ollama and the configured model are ready." : "Ollama is reachable but the model is missing."
      };
    } catch {
      return { ok: false, provider: "ollama", model: this.config.model, detail: "Ollama is unreachable." };
    }
  }

  private validateModelReply(
    parsed: z.infer<typeof modelReplySchema>,
    context: FactoryChatContext,
    startedAt: number
  ): FactoryChatResult {
    const prompt = latestUserMessage(context);
    const intent = inferExplicitIntent(prompt);
    const modelTemplate = parsed.action.templateId
      ? this.templates.find((item) => item.id === parsed.action.templateId)
      : undefined;
    const template =
      findTemplate(prompt, this.templates) ??
      modelTemplate ??
      this.templates.find((item) => item.id === context.selectedTemplateId);
    let action: FactoryChatAction = { type: "none" };

    if (intent.wantsList) {
      action = { type: "list", filter: inferCatalogFilter(prompt) };
    } else if (intent.wantsRollback) {
      action = { type: "rollback" };
    } else if (intent.wantsCreate && template) {
      action = {
        type: intent.wantsApply ? "generate-and-apply" : "generate",
        templateId: template.id
      };
    } else if (intent.wantsApply) {
      action = { type: "apply" };
    } else if (intent.wantsSelect && template) {
      action = { type: "select", templateId: template.id };
    }

    if ((action.type === "apply" || action.type === "rollback") && !context.generatedPluginName) {
      return {
        reply:
          context.locale === "ko"
            ? "먼저 플러그인을 생성해주세요. 생성 결과가 있어야 적용이나 롤백을 안전하게 진행할 수 있습니다."
            : "Please generate a plugin first. Apply and rollback require a validated generation result.",
        action: { type: "none" },
        provider: "ollama",
        model: this.config.model,
        latencyMs: Date.now() - startedAt
      };
    }

    const commandReply = commandAcknowledgement(context.locale, action, template, context.generatedPluginName);
    return {
      reply:
        action.type === "list"
          ? catalogReply(this.templates, context.locale, action.filter ?? "all")
          : commandReply ?? parsed.reply,
      action,
      provider: "ollama",
      model: this.config.model,
      latencyMs: Date.now() - startedAt
    };
  }

  private rulesReply(
    context: FactoryChatContext,
    startedAt: number,
    fallbackReason: FactoryChatResult["fallbackReason"]
  ): FactoryChatResult {
    const prompt = latestUserMessage(context);
    const filter = inferCatalogFilter(prompt);
    const intent = inferExplicitIntent(prompt);
    const template = findTemplate(prompt, this.templates) ?? this.templates.find((item) => item.id === context.selectedTemplateId);

    let reply: string;
    let action: FactoryChatAction = { type: "none" };
    if (intent.wantsList) {
      action = { type: "list", filter };
      reply = catalogReply(this.templates, context.locale, filter);
    } else if (intent.wantsRollback) {
      action = context.generatedPluginName ? { type: "rollback" } : { type: "none" };
      reply = context.generatedPluginName
        ? localized(context.locale, "I will prepare a rollback preview first.", "먼저 롤백 미리보기를 준비하겠습니다.")
        : localized(context.locale, "Generate a plugin first so I can prepare a rollback.", "롤백을 준비하려면 먼저 플러그인을 생성해주세요.");
    } else if (intent.wantsCreate && template) {
      action = { type: intent.wantsApply ? "generate-and-apply" : "generate", templateId: template.id };
      reply = localized(
        context.locale,
        `I found ${template.displayName}. I will generate its scaffold and show each step.`,
        `${template.displayName} 템플릿을 찾았습니다. 스캐폴드를 생성하면서 각 단계를 보여드릴게요.`
      );
    } else if (intent.wantsApply) {
      action = context.generatedPluginName ? { type: "apply" } : { type: "none" };
      reply = context.generatedPluginName
        ? localized(context.locale, "I will run the guarded Vault apply flow.", "검증과 승인 절차를 거쳐 Vault 적용을 진행하겠습니다.")
        : localized(context.locale, "Generate a plugin first, then ask me to apply it.", "먼저 플러그인을 생성한 뒤 적용을 요청해주세요.");
    } else if (intent.wantsSelect && template) {
      action = { type: "select", templateId: template.id };
      reply = localized(
        context.locale,
        `I selected ${template.displayName}. Ask me to generate it when you are ready.`,
        `${template.displayName} 템플릿을 선택했습니다. 준비되면 생성해달라고 말씀해주세요.`
      );
    } else {
      reply =
        fallbackReason === "invalid-response"
          ? localized(
              context.locale,
              "The AI connection is healthy, but this response could not be validated after an automatic retry. Safe catalog and workflow commands remain available through the rules fallback.",
              "AI 연결은 정상이지만 자동 재시도 후에도 이번 답변 형식을 검증하지 못했습니다. 안전한 규칙 fallback으로 카탈로그 조회와 작업 명령은 계속 사용할 수 있습니다."
            )
          : localized(
              context.locale,
              "The local AI is temporarily unavailable, but catalog lookup, generation, apply, and rollback commands still work through the safe fallback.",
              "로컬 AI에 일시적으로 연결할 수 없지만, 안전한 fallback으로 카탈로그 조회·생성·적용·롤백 명령은 계속 사용할 수 있습니다."
            );
    }

    return {
      reply,
      action,
      provider: "rules",
      fallbackReason,
      latencyMs: Date.now() - startedAt
    };
  }

  private systemPrompt(context: FactoryChatContext): string {
    const conversation = context.messages.slice(-6).map((message) => message.content).join("\n");
    const referencedTemplates = findReferencedTemplates(conversation, this.templates);
    const selectedTemplate = this.templates.find((template) => template.id === context.selectedTemplateId);
    if (selectedTemplate && !referencedTemplates.some((template) => template.id === selectedTemplate.id)) {
      referencedTemplates.push(selectedTemplate);
    }
    const catalogRows = this.templates.map((template) =>
      [template.id, template.displayName, template.pluginType, template.source, template.integrationTarget].join(" | ")
    );
    const relevantDetails = referencedTemplates.slice(0, 6).map((template) => ({
      id: template.id,
      name: template.displayName,
      description: template.description,
      tags: template.tags
    }));
    return [
      "You are the conversational assistant inside Vault Plugin Factory.",
      `Always answer in ${context.locale === "ko" ? "Korean" : "English"}.`,
      "Use only the supplied catalog for claims about available templates. Never invent a plugin or template ID.",
      "You may discuss, explain, compare, and answer follow-up questions naturally.",
      "Keep conversational replies concise: 2-5 sentences and at most 120 words. Catalog lists are rendered separately by the backend.",
      "Choose exactly one action: none, list, select, generate, generate-and-apply, apply, or rollback.",
      "Use list only when the user explicitly requests a catalog enumeration or list, and set filter to all, auth, secret, database, partner, community, or learning.",
      "For explanations, comparisons, recommendations, and general questions, always use action none even when plugin names are mentioned.",
      "Use generate only when the user explicitly asks to create or make a plugin.",
      "Use generate-and-apply only when the user explicitly asks to both create and apply the same plugin.",
      "Use apply only when the user explicitly asks to apply/register/enable an already generated plugin.",
      "The latest user message has priority over the selected template and generated plugin context.",
      "When the latest message names a different catalog target and asks to create it, never apply the previously generated plugin.",
      "Never claim that apply succeeded; the backend executes and reports that separately.",
      "Never request, reveal, or repeat Vault tokens, credentials, API keys, or secrets.",
      "Return JSON only: {\"reply\":string,\"action\":{\"type\":string,\"templateId\":string|null,\"filter\":string|null}}.",
      `Current selected template ID: ${context.selectedTemplateId ?? "none"}.`,
      `Current generated plugin: ${context.generatedPluginName ?? "none"}.`,
      "Catalog rows (id | name | type | source | target):",
      catalogRows.join("\n"),
      `Relevant catalog details: ${JSON.stringify(relevantDetails)}`
    ].join("\n");
  }

  private async requestModel(
    context: FactoryChatContext,
    recovery: boolean
  ): Promise<z.infer<typeof modelReplySchema> | undefined> {
    const recoveryInstruction = recovery
      ? "The previous response was invalid or truncated. Return complete JSON now, keep reply under 80 words, and close every JSON string and object."
      : undefined;
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: "system", content: [this.systemPrompt(context), recoveryInstruction].filter(Boolean).join("\n") },
          ...context.messages.slice(-12)
        ],
        stream: false,
        format: ollamaReplyFormat,
        think: false,
        keep_alive: "30m",
        options: {
          temperature: 0.2,
          num_ctx: 8192,
          num_predict: recovery ? 260 : 480
        }
      })
    });
    if (!response.ok) {
      throw new Error(`ollama-http-${response.status}`);
    }
    const payload = (await response.json()) as OllamaChatResponse;
    return parseModelReply(payload.message?.content ?? "");
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = this.config.timeoutMs): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Ollama did not return JSON.");
  }
}

function parseModelReply(content: string): z.infer<typeof modelReplySchema> | undefined {
  try {
    const parsed = modelReplySchema.safeParse(parseJsonObject(content));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function latestUserMessage(context: FactoryChatContext): string {
  return [...context.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function inferCatalogFilter(prompt: string): FactoryCatalogFilter {
  const normalized = normalizePrompt(prompt);
  if (/데이터베이스|database|db\b/.test(normalized)) return "database";
  if (/인증|auth/.test(normalized)) return "auth";
  if (/시크릿|secret/.test(normalized)) return "secret";
  if (/파트너|partner/.test(normalized)) return "partner";
  if (/커뮤니티|community/.test(normalized)) return "community";
  if (/학습|예제|learning|example/.test(normalized)) return "learning";
  return "all";
}

function catalogReply(
  templates: VaultPluginTemplate[],
  locale: FactoryChatLocale,
  filter: FactoryCatalogFilter
): string {
  const selected = templates.filter((template) => {
    if (filter === "all") return true;
    if (filter === "partner" || filter === "community" || filter === "learning") return template.source === filter;
    return template.pluginType === filter;
  });
  const groups = (["auth", "secret", "database"] as const)
    .map((pluginType) => ({ pluginType, templates: selected.filter((template) => template.pluginType === pluginType) }))
    .filter((group) => group.templates.length > 0);
  const heading = localized(
    locale,
    `I can currently make ${selected.length} ${filter === "all" ? "plugin" : filter} templates. Here is the complete list:`,
    `현재 만들 수 있는 ${filter === "all" ? "전체 플러그인" : filter} 템플릿은 ${selected.length}개입니다. 전체 목록은 다음과 같습니다:`
  );
  const sections = groups.map((group) => {
    const label = group.pluginType === "auth" ? "Auth" : group.pluginType === "secret" ? "Secret engine" : "Database";
    return `${label} (${group.templates.length})\n${group.templates
      .map((template, index) => `${index + 1}. ${template.displayName}`)
      .join("\n")}`;
  });
  return [heading, ...sections].join("\n\n");
}

function commandAcknowledgement(
  locale: FactoryChatLocale,
  action: FactoryChatAction,
  template?: VaultPluginTemplate,
  generatedPluginName?: string
): string | undefined {
  if ((action.type === "generate" || action.type === "generate-and-apply") && template) {
    return action.type === "generate-and-apply"
      ? localized(
          locale,
          `I found ${template.displayName}. I will generate the scaffold first, then continue through the guarded Vault apply flow.`,
          `${template.displayName} 템플릿을 찾았습니다. 먼저 스캐폴드를 생성한 뒤 안전장치를 거쳐 Vault 적용까지 이어가겠습니다.`
        )
      : localized(
          locale,
          `I found ${template.displayName}. I will start generating its scaffold now.`,
          `${template.displayName} 템플릿을 찾았습니다. 지금 스캐폴드 생성을 시작하겠습니다.`
        );
  }
  if (action.type === "apply") {
    return localized(
      locale,
      `I will validate ${generatedPluginName ?? "the generated plugin"} and its SHA-256, then start the guarded Vault apply flow.`,
      `생성된 플러그인 ${generatedPluginName ?? "이름 미확정"}의 결과와 SHA-256을 검증한 뒤 안전한 Vault 적용 절차를 시작하겠습니다.`
    );
  }
  if (action.type === "rollback") {
    return localized(
      locale,
      `I will inspect ${generatedPluginName ?? "the generated plugin"} and prepare a rollback preview before changing Vault.`,
      `${generatedPluginName ?? "생성된 플러그인"}의 현재 상태를 확인하고 Vault 변경 전에 롤백 미리보기를 준비하겠습니다.`
    );
  }
  return undefined;
}

function inferExplicitIntent(prompt: string): {
  wantsList: boolean;
  wantsCreate: boolean;
  wantsApply: boolean;
  wantsRollback: boolean;
  wantsSelect: boolean;
} {
  const normalized = normalizePrompt(prompt);
  const conversationalQuestion =
    /차이|비교|설명|추천|장단점|적합|왜|어떻게|difference|compare|comparison|explain|recommend|pros? and cons?|suitable|why|how/.test(
      normalized
    );
  const categoryList =
    /(?:그중|이중).*(?:만|목록|알려|보여)|(?:데이터베이스|database|db\b|인증|auth|시크릿|secret|파트너|partner|커뮤니티|community|학습|예제|learning|example).*(?:플러그인|plugin|템플릿|template).*(?:목록|알려|보여|list|show|tell)/.test(
      normalized
    );
  const catalogSubject = /플러그인|plugin|템플릿|template/.test(normalized);
  const explicitList =
    /목록|리스트|카탈로그|\blist\b|\bcatalog\b|show.*(?:plugins?|templates?)|what plugins|which plugins|available plugins/.test(
      normalized
    ) ||
    (catalogSubject && /전부|모든|전체|종류|뭐가 있|무엇이 있|어떤.*(?:있|가능)|보여줘|can you make/.test(normalized));

  return {
    wantsList: !conversationalQuestion && (categoryList || explicitList),
    wantsCreate:
      /만들(?:어|고|어서|자|기)|만든\s*(?:다음|후)|생성(?:해|하고|해서)|제작(?:해|하고|해서)|스캐폴드.*(?:만들|생성)|\b(?:create|make|generate|scaffold|build)\b/.test(
        normalized
      ),
    wantsApply:
      /적용(?:해|하고|해서|까지)|등록(?:해|하고|해서)|활성화(?:해|하고|해서)|배포(?:해|하고|해서)|\bapply\b|\bregister\b|\benable\b|\bdeploy\b/.test(
        normalized
      ),
    wantsRollback:
      /롤백해|되돌려|등록.*해제|비활성화해|\brollback\b|\bundo\b|\bderegister\b|\bdisable\b/.test(normalized),
    wantsSelect:
      !conversationalQuestion &&
      /선택해(?:줘|주세요|라)?(?:\s|$)|골라(?:줘|주세요)?(?:\s|$)|고를게|\bselect\b|\bchoose\b/.test(normalized)
  };
}

function findTemplate(prompt: string, templates: VaultPluginTemplate[]): VaultPluginTemplate | undefined {
  let best: { template: VaultPluginTemplate; score: number } | undefined;
  for (const template of templates) {
    const score = templateMatchScore(prompt, template);
    if (score > 0 && (!best || score > best.score)) best = { template, score };
  }
  return best && best.score >= 8 ? best.template : undefined;
}

function findReferencedTemplates(prompt: string, templates: VaultPluginTemplate[]): VaultPluginTemplate[] {
  return templates
    .map((template) => ({ template, score: templateMatchScore(prompt, template) }))
    .filter((candidate) => candidate.score >= 8)
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.template);
}

function templateMatchScore(prompt: string, template: VaultPluginTemplate): number {
  const normalized = normalizePrompt(prompt);
  const name = template.name.toLowerCase();
  const displayName = template.displayName.toLowerCase();
  const target = template.integrationTarget.toLowerCase();
  const haystack = `${name} ${displayName} ${target} ${template.tags.join(" ")} ${template.description}`.toLowerCase();
  let score = 0;
  if (normalized.includes(name)) score += 80;
  if (normalized.includes(displayName)) score += 70;
  if (normalized.includes(target)) score += 45;
  for (const token of normalized.split(/[^a-z0-9가-힣]+/).filter((item) => item.length > 1)) {
    if (token === target) score += 30;
    else if (haystack.includes(token)) score += 6;
  }
  return score;
}

function normalizePrompt(prompt: string): string {
  const synonyms: Array<[string, string]> = [
    ["카프카", "kafka"],
    ["깃허브", "github"],
    ["섹티고", "sectigo"],
    ["디지서트", "digicert"],
    ["레디스", "redis"],
    ["클릭하우스", "clickhouse"],
    ["키클록", "keycloak"],
    ["그라파나", "grafana"],
    ["오픈에이아이", "openai"],
    ["쿠버네티스", "kubernetes"],
    ["스노우플레이크", "snowflake"]
  ];
  return synonyms.reduce(
    (value, [source, target]) => value.replaceAll(source, `${source} ${target}`),
    prompt.toLowerCase()
  );
}

function localized(locale: FactoryChatLocale, english: string, korean: string): string {
  return locale === "ko" ? korean : english;
}
