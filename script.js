// Global App Configuration
let userPhoneNumber = "";
let userGhostID = "";
let myPeerInstance = null;
let activeConnections = [];
let typingTimeout = null;
let userCurrentDP = "https://api.dicebear.com/7.x/bottts/svg?seed=ghost";

const bannedWords = ["blackmail", "blakmail", "paisa do", "rupay do", "video leak", "threat", "money", "leak"];

// 1. Authentication and Screen Flow Control
function verifyAndLogin() {
    const phoneInput = document.getElementById("phone-number").value.trim();
    if (phoneInput === "" || phoneInput.length < 10) {
        alert("Security requirement: Enter a valid verified phone number.");
        return;
    }
    userPhoneNumber = phoneInput;
    userGhostID = "Ghost-" + userPhoneNumber.slice(-4);

    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("wall-screen").classList.remove("hidden");
    document.getElementById("user-badge").innerText = userGhostID;
    
    userCurrentDP = "https://api.dicebear.com/7.x/bottts/svg?seed=" + userGhostID;
    document.getElementById("my-dp-display").src = userCurrentDP;

    initializeMeshNetwork();
    setupTypingListener();
}

// 2. Theme Toggle Logic
function toggleAppTheme() {
    const bodyNode = document.body;
    const themeBtn = document.getElementById("theme-toggle-btn");

    if (bodyNode.classList.contains("dark-theme")) {
        bodyNode.classList.remove("dark-theme");
        bodyNode.classList.add("light-theme");
        themeBtn.innerText = "🌙";
    } else {
        bodyNode.classList.remove("light-theme");
        bodyNode.classList.add("dark-theme");
        themeBtn.innerText = "☀️";
    }
}

// 3. Modal Controls
function openConnectModal() {
    document.getElementById("connect-modal").classList.remove("hidden");
}

function closeConnectModal() {
    document.getElementById("connect-modal").classList.add("hidden");
    document.getElementById("peer-id-input").value = "";
}

// 4. Real Gallery DP Controller
function triggerDPUpload() {
    document.getElementById("dp-file-input").click();
}

function handleDPChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        userCurrentDP = e.target.result;
        document.getElementById("my-dp-display").src = userCurrentDP;
        broadcastProfileUpdate();
    };
    reader.readAsDataURL(file);
}

function broadcastProfileUpdate() {
    activeConnections.forEach(conn => {
        if (conn.open) {
            conn.send({
                type: "dp-update",
                sender: userGhostID,
                dpData: userCurrentDP
            });
        }
    });
}

// 5. Content Filter
function isContentSafe(text) {
    const cleanText = text.toLowerCase().trim();
    for (let i = 0; i < bannedWords.length; i++) {
        if (cleanText.includes(bannedWords[i])) {
            return false;
        }
    }
    return true;
}

// 6. Decentralized WebRTC Mesh Initialization
function initializeMeshNetwork() {
    myPeerInstance = new Peer(userGhostID);

    myPeerInstance.on('open', (id) => {
        updateSystemStatus("System: Broadcast node live on network. ID: " + id);
    });

    myPeerInstance.on('connection', (incomingConn) => {
        setupConnectionListeners(incomingConn);
    });

    myPeerInstance.on('error', (err) => {
        console.error("Mesh Network Error:", err);
        updateSystemStatus("Mesh network syncing issue. Retrying connection...");
    });
}

function connectFromUI() {
    const targetInput = document.getElementById("peer-id-input");
    const targetPeerID = targetInput.value.trim();

    if (targetPeerID === "" || targetPeerID === userGhostID) {
        alert("Invalid Ghost ID.");
        return;
    }
    
    const alreadyConnected = activeConnections.some(conn => conn.peer === targetPeerID);
    if (alreadyConnected) {
        alert("Already linked to this node.");
        closeConnectModal();
        return;
    }

    connectToPeerNode(targetPeerID);
    closeConnectModal();
}

// 7. Handshake Connection Initiator
function connectToPeerNode(targetPeerID) {
    updateSystemStatus(`Attempting direct link handshake to: ${targetPeerID}...`);
    const outboundConn = myPeerInstance.connect(targetPeerID);
    setupConnectionListeners(outboundConn);
}

// 8. Connection Listeners & Event Manager
function setupConnectionListeners(conn) {
    conn.on('open', () => {
        updateSystemStatus(`Direct secure line established with ${conn.peer}!`);
        
        if (!activeConnections.some(c => c.peer === conn.peer)) {
            activeConnections.push(conn);
        }
        
        conn.send({
            type: "dp-update",
            sender: userGhostID,
            dpData: userCurrentDP
        });
    });

    conn.on('data', (data) => {
        if (!data) return;

        if (data.type === "chat") {
            if (isContentSafe(data.text)) {
                appendMessage(data.sender, data.text, "incoming", data.msgId, data.senderDP);
                sendDeliveryAck(conn, data.msgId);
            }
        } 
        else if (data.type === "typing") {
            const typingIndicator = document.getElementById("typing-indicator");
            if (data.isTyping) {
                typingIndicator.innerText = `${data.sender} is typing...`;
                typingIndicator.classList.remove("hidden");
            } else {
                typingIndicator.classList.add("hidden");
            }
        }
        else if (data.type === "ack") {
            const tickElement = document.getElementById(`tick-${data.msgId}`);
            if (tickElement) {
                tickElement.innerText = " ✓✓";
                tickElement.style.color = "#00f2fe";
            }
        }
        else if (data.type === "dp-update") {
            window["dp_" + data.sender] = data.dpData;
            updateSystemStatus(`System: ${data.sender} updated their profile picture.`);
            
            const openMessages = document.querySelectorAll(`.msg-avatar-${data.sender}`);
            openMessages.forEach(img => {
                img.src = data.dpData;
            });
        }
    });

    conn.on('close', () => {
        updateSystemStatus(`Peer disconnected.`);
        activeConnections = activeConnections.filter(c => c.peer !== conn.peer);
    });
}

// 9. Typing Status Broadcaster
function setupTypingListener() {
    const msgInput = document.getElementById("msg-input");
    if (!msgInput) return;
    
    msgInput.addEventListener("input", () => {
        broadcastTypingStatus(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            broadcastTypingStatus(false);
        }, 2000);
    });
}

function broadcastTypingStatus(isTyping) {
    activeConnections.forEach(conn => {
        if (conn.open) {
            conn.send({
                type: "typing",
                sender: userGhostID,
                isTyping: isTyping
            });
        }
    });
}

function sendDeliveryAck(conn, msgId) {
    if (conn.open) {
        conn.send({
            type: "ack",
            msgId: msgId
        });
    }
}

// 10. Core Messaging System
function sendMessage() {
    const msgInput = document.getElementById("msg-input");
    const messageText = msgInput.value.trim();

    if (messageText === "") return;

    if (!isContentSafe(messageText)) {
        alert("⚠️ Security Policy Violation!");
        msgInput.value = "";
        return;
    }

    const uniqueMsgId = "msg-" + Date.now();
    appendMessage(userGhostID, messageText, "outgoing", uniqueMsgId, userCurrentDP);

    activeConnections.forEach(conn => {
        if (conn.open) {
            conn.send({
                type: "chat",
                msgId: uniqueMsgId,
                sender: userGhostID,
                text: messageText,
                senderDP: userCurrentDP
            });
        }
    });
    
    broadcastTypingStatus(false);
    msgInput.value = "";
}

// 11. UI Rendering Utilities (Left/Right Integrated Layout)
function appendMessage(sender, text, direction, msgId, avatarSrc) {
    const container = document.getElementById("messages-container");
    const card = document.createElement("div");
    
    card.style.display = "flex";
    card.style.gap = "10px";
    card.style.alignItems = "flex-start";
    card.style.padding = "10px 14px";
    card.style.borderRadius = "12px";
    card.style.width = "fit-content";
    card.style.marginBottom = "4px";

    if (direction === "outgoing") {
        card.className = "card outgoing outgoing-row";
    } else {
        card.className = "card incoming";
    }

    const finalAvatar = avatarSrc || window["dp_" + sender] || "https://api.dicebear.com/7.x/bottts/svg?seed=" + sender;

    const imgNode = document.createElement("img");
    imgNode.src = finalAvatar;
    imgNode.className = `msg-avatar-${sender}`;
    imgNode.style.width = "30px";
    imgNode.style.height = "30px";
    imgNode.style.borderRadius = "50px";
    imgNode.style.border = "1px solid var(--accent-color)";
    imgNode.style.flexShrink = "0";

    const contentDiv = document.createElement("div");

    const senderDiv = document.createElement("div");
    senderDiv.className = "sender";
    senderDiv.innerText = sender;
    if (direction === "outgoing") {
        senderDiv.style.display = "none";
    }

    const textDiv = document.createElement("div");
    textDiv.innerText = text;
    textDiv.style.wordBreak = "break-word";
    textDiv.style.fontSize = "14px";

    if (direction === "outgoing") {
        const tickSpan = document.createElement("span");
        tickSpan.id = `tick-${msgId}`;
        tickSpan.innerText = " ✓";
        tickSpan.style.fontSize = "11px";
        tickSpan.style.color = "#a6b4be";
        tickSpan.style.marginLeft = "5px";
        textDiv.appendChild(tickSpan);
    }

    contentDiv.appendChild(senderDiv);
    contentDiv.appendChild(textDiv);
    
    card.appendChild(imgNode);
    card.appendChild(contentDiv);
    
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;
}

function updateSystemStatus(statusText) {
    const container = document.getElementById("messages-container");
    const sysMsg = document.createElement("div");
    sysMsg.className = "system-msg";
    sysMsg.innerText = statusText;
    container.appendChild(sysMsg);
    container.scrollTop = container.scrollHeight;
}
