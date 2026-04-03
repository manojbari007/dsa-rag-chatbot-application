// ─── State ────────────────────────────────────────
const state = {
    chats: JSON.parse(localStorage.getItem("dsa_chats") || "[]"),
    activeChatId: null,
    isStreaming: false,
};

// ─── DOM Elements ─────────────────────────────────
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const messagesArea = document.getElementById("messagesArea");
const welcomeScreen = document.getElementById("welcomeScreen");
const sidebarChats = document.getElementById("sidebarChats");
const newChatBtn = document.getElementById("newChatBtn");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const chatContainer = document.getElementById("chatContainer");

// ─── Markdown Parser (simple) ─────────────────────
function parseMarkdown(text) {
    let html = text
        // Code blocks
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
        })
        // Inline code
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        // Bold
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        // Italic
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        // Headers
        .replace(/^### (.+)$/gm, "<h3>$1</h3>")
        .replace(/^## (.+)$/gm, "<h2>$1</h2>")
        .replace(/^# (.+)$/gm, "<h1>$1</h1>")
        // Unordered lists
        .replace(/^[*-] (.+)$/gm, "<li>$1</li>")
        // Numbered lists
        .replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
    // Paragraphs
    html = html
        .split("\n\n")
        .map((block) => {
            block = block.trim();
            if (!block) return "";
            if (
                block.startsWith("<h") ||
                block.startsWith("<ul") ||
                block.startsWith("<ol") ||
                block.startsWith("<pre") ||
                block.startsWith("<li")
            )
                return block;
            return `<p>${block.replace(/\n/g, "<br>")}</p>`;
        })
        .join("\n");

    return html;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ─── Chat Management ──────────────────────────────
function createNewChat() {
    const chat = {
        id: Date.now().toString(),
        title: "New Chat",
        date: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }),
        messages: [],
    };
    state.chats.unshift(chat);
    state.activeChatId = chat.id;
    saveChats();
    renderSidebar();
    showWelcomeScreen();
    chatInput.focus();
    return chat;
}

function getActiveChat() {
    return state.chats.find((c) => c.id === state.activeChatId);
}

function saveChats() {
    localStorage.setItem("dsa_chats", JSON.stringify(state.chats));
}

function deleteChat(chatId) {
    state.chats = state.chats.filter((c) => c.id !== chatId);
    if (state.activeChatId === chatId) {
        state.activeChatId = state.chats.length > 0 ? state.chats[0].id : null;
    }
    saveChats();
    renderSidebar();
    if (state.activeChatId) {
        renderMessages();
    } else {
        showWelcomeScreen();
    }
}

function switchChat(chatId) {
    state.activeChatId = chatId;
    renderSidebar();
    renderMessages();
    sidebar.classList.remove("open");
}

// ─── Rendering ────────────────────────────────────
function renderSidebar() {
    sidebarChats.innerHTML = "";
    state.chats.forEach((chat) => {
        const item = document.createElement("div");
        item.className = `chat-history-item${chat.id === state.activeChatId ? " active" : ""}`;
        item.innerHTML = `
            <div class="chat-history-info">
                <div class="chat-history-title">${escapeHtml(chat.title)}</div>
                <div class="chat-history-date">⊙ ${chat.date}</div>
            </div>
            <button class="chat-delete-btn" data-id="${chat.id}" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>`;
        item.querySelector(".chat-history-info").addEventListener("click", () => switchChat(chat.id));
        item.querySelector(".chat-delete-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        });
        sidebarChats.appendChild(item);
    });
}

function showWelcomeScreen() {
    welcomeScreen.classList.remove("hidden");
    messagesArea.classList.remove("active");
    messagesArea.innerHTML = "";
}

function renderMessages() {
    const chat = getActiveChat();
    if (!chat || chat.messages.length === 0) {
        showWelcomeScreen();
        return;
    }
    welcomeScreen.classList.add("hidden");
    messagesArea.classList.add("active");
    messagesArea.innerHTML = "";

    chat.messages.forEach((msg) => {
        appendMessage(msg.role, msg.content, false);
    });

    scrollToBottom();
}

function appendMessage(role, content, animate = true) {
    const isUser = role === "user";
    const msgEl = document.createElement("div");
    msgEl.className = "message";
    if (animate) msgEl.style.animation = "fadeIn 0.3s ease";

    msgEl.innerHTML = `
        <div class="message-header">
            <div class="message-avatar ${isUser ? "user" : "assistant"}">${isUser ? "U" : "D"}</div>
            <span class="message-sender">${isUser ? "You" : "DSA Expert"}</span>
        </div>
        <div class="message-body">${isUser ? `<p>${escapeHtml(content)}</p>` : parseMarkdown(content)}</div>`;

    messagesArea.appendChild(msgEl);
    return msgEl;
}

function showTypingIndicator() {
    const msgEl = document.createElement("div");
    msgEl.className = "message";
    msgEl.id = "typingMessage";
    msgEl.innerHTML = `
        <div class="message-header">
            <div class="message-avatar assistant">D</div>
            <span class="message-sender">DSA Expert</span>
        </div>
        <div class="typing-indicator">
            <span></span><span></span><span></span>
        </div>
        <div class="message-body" id="streamingBody"></div>`;
    messagesArea.appendChild(msgEl);
    scrollToBottom();
    return msgEl;
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ─── Send Message ─────────────────────────────────
async function sendMessage(text) {
    if (!text.trim() || state.isStreaming) return;

    state.isStreaming = true;
    sendBtn.disabled = true;
    chatInput.value = "";
    chatInput.style.height = "auto";

    // Create chat if none active
    let chat = getActiveChat();
    if (!chat) {
        chat = createNewChat();
    }

    // Hide welcome, show messages
    welcomeScreen.classList.add("hidden");
    messagesArea.classList.add("active");

    // Add user message
    chat.messages.push({ role: "user", content: text });
    if (chat.messages.length === 1) {
        chat.title = text.substring(0, 30) + (text.length > 30 ? "..." : "");
        renderSidebar();
    }
    appendMessage("user", text, true);
    scrollToBottom();
    saveChats();

    // Show typing indicator
    const typingEl = showTypingIndicator();

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                history: chat.messages.slice(0, -1),
            }),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        // Stream the response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        const bodyEl = typingEl.querySelector("#streamingBody");
        const typingDots = typingEl.querySelector(".typing-indicator");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    if (data === "[DONE]") continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            if (typingDots) typingDots.style.display = "none";
                            fullText += parsed.content;
                            bodyEl.innerHTML = parseMarkdown(fullText);
                            scrollToBottom();
                        }
                        if (parsed.error) {
                            typingDots.style.display = "none";
                            bodyEl.innerHTML = `<p style="color:#ef4444;">Error: ${escapeHtml(parsed.error)}</p>`;
                        }
                    } catch {}
                }
            }
        }

        // Save assistant message
        chat.messages.push({ role: "assistant", content: fullText });
        saveChats();
    } catch (err) {
        const bodyEl = typingEl.querySelector("#streamingBody");
        const typingDots = typingEl.querySelector(".typing-indicator");
        if (typingDots) typingDots.style.display = "none";
        bodyEl.innerHTML = `<p style="color:#ef4444;">Error: ${escapeHtml(err.message)}. Please try again.</p>`;
    }

    state.isStreaming = false;
    updateSendBtn();
}

// ─── Event Listeners ──────────────────────────────
chatInput.addEventListener("input", () => {
    // Auto-resize textarea
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + "px";
    updateSendBtn();
});

chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(chatInput.value);
    }
});

sendBtn.addEventListener("click", () => {
    sendMessage(chatInput.value);
});

newChatBtn.addEventListener("click", () => {
    createNewChat();
    sidebar.classList.remove("open");
});

menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
});

// Topic card clicks
document.querySelectorAll(".topic-card").forEach((card) => {
    card.addEventListener("click", () => {
        const query = card.getAttribute("data-query");
        if (query) sendMessage(query);
    });
});

function updateSendBtn() {
    sendBtn.disabled = !chatInput.value.trim() || state.isStreaming;
}

// ─── Init ─────────────────────────────────────────
function init() {
    renderSidebar();
    if (state.chats.length > 0) {
        state.activeChatId = state.chats[0].id;
        const chat = getActiveChat();
        if (chat && chat.messages.length > 0) {
            renderMessages();
        } else {
            showWelcomeScreen();
        }
        renderSidebar();
    } else {
        showWelcomeScreen();
    }
    chatInput.focus();
}

init();
