// Global App Configuration & State Management
let userPhoneNumber = "";
let userGhostID = "";
let myPeerInstance = null;
let activeConnections = [];
let typingTimeout = null;
let userCurrentDP = "https://api.dicebear.com/7.x/bottts/svg?seed=ghost";

// Advanced Messaging Feature Flags
let isViewOnceEnabled = false;
let mediaRecorderInstance = null;
let recordedAudioChunks = [];
let isRecordingAudio = false;
let selectedMsgIdForContext = null;

// P2P Voice and Video Call Mechanics
let localMediaStream = null;
let activeP2PCallInstance = null;
let pendingIncomingCallEvent = null;

const bannedWords = ["blackmail", "blakmail", "paisa do", "rupay do", "video leak", "threat", "money", "leak"];

// 1. App Privacy Pin Lock System
function checkAppLock() {
    const savedPin = localStorage.getItem("superviva_app_pin");
    if (savedPin) {
        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("lock-screen").classList.remove("hidden");
    }
}

function unlockApp() {
    const pinInput = document.getElementById("app-pin-input").value;
    const savedPin = localStorage.getItem("superviva_app_pin");
    if (pinInput === savedPin) {
        document.getElementById("lock-screen").classList.add("hidden");
        document.getElementById("login-screen").classList.remove("hidden");
        verifyAndLoginAuto();
    } else {
        alert("Incorrect PIN Code Security Rejection.");
        document.getElementById("app-pin-input").value = "";
    }
}

// 2. Authentication Flow
function verifyAndLogin() {
    const phoneInput = document.getElementById("phone-number").value.trim();
    const pinSetup = document.getElementById("set-pin-input").value.trim();
    if (phoneInput === "" || phoneInput.length < 10) {
        alert("Security requirement: Enter a valid verified phone number.");
        return;
    }
    if (pinSetup.length === 4) localStorage.setItem("superviva_app_pin", pinSetup);
    localStorage.setItem("superviva_saved_phone", phoneInput);
    executeLoginSequence(phoneInput);
}

function verifyAndLoginAuto() {
    const savedPhone = localStorage.getItem("superviva_saved_phone");
    if (savedPhone) executeLoginSequence(savedPhone);
}

function executeLoginSequence(phone) {
    userPhoneNumber = phone;
    userGhostID = "Ghost-" + userPhoneNumber.slice(-4);
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("wall-screen").classList.remove("hidden");
    document.getElementById("user-badge").innerText = userGhostID;
    
    userCurrentDP = "https://api.dicebear.com/7.x/bottts/svg?seed=" + userGhostID;
    document.getElementById("my-dp-display").src = userCurrentDP;

    initializeMeshNetwork();
    setupTypingListener();
}

// 3. Theme Switcher
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

// Modal Toggle Handlers
function openConnectModal() { document.getElementById("connect-modal").classList.remove("hidden"); }
function closeConnectModal() { document.getElementById("connect-modal").classList.add("hidden"); document.getElementById("peer-id-input").value = ""; }
function openReactionModal(msgId) { selectedMsgIdForContext = msgId; document.getElementById("reaction-modal").classList.remove("hidden"); }
function closeReactionModal() { document.getElementById("reaction-modal").classList.add("hidden"); }

// 4. Gallery Profile Picture Controls
function triggerDPUpload() { document.getElementById("dp-file-input").click(); }
function handleDPChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        userCurrentDP = e.target.result;
        document.getElementById("my-dp-display").src = userCurrentDP;
        broadcastToMesh({ type: "dp-update", sender: userGhostID, dpData: userCurrentDP });
    };
    reader.readAsDataURL(file);
}

// 5. Advanced Media & Document Sharing Engine
function triggerFileAttachment() { document.getElementById("attachment-file-input").click(); }
function handleFileAttachment(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        sendMessageBundle("media", { fileData: e.target.result, fileName: file.name, fileType: file.type });
    };
    reader.readAsDataURL(file);
}

// 6. View Once Toggle
function toggleViewOnceMode() {
    isViewOnceEnabled = !isViewOnceEnabled;
    const btn = document.getElementById("view-once-btn");
    const badge = document.getElementById("view-once-badge");
    if (isViewOnceEnabled) { btn.style.color = "#ef4444"; badge.classList.remove("hidden"); } 
    else { btn.style.color = "#9ca3af"; badge.classList.add("hidden"); }
}

// 7. Voice Note Recorder Engine
function toggleVoiceRecord() {
    if (!isRecordingAudio) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            recordedAudioChunks = [];
            mediaRecorderInstance = new MediaRecorder(stream);
            mediaRecorderInstance.ondataavailable = e => recordedAudioChunks.push(e.data);
            mediaRecorderInstance.onstop = () => {
                const audioBlob = new Blob(recordedAudioChunks, { type: 'audio/ogg; codecs=opus' });
                const reader = new FileReader();
                reader.onload = function(e) { sendMessageBundle("audio", e.target.result); };
                reader.readAsDataURL(audioBlob);
            };
            mediaRecorderInstance.start();
            isRecordingAudio = true;
            document.getElementById("voice-record-btn").innerText = "🛑";
        }).catch(() => alert("Mic hardware access denied."));
    } else {
        mediaRecorderInstance.stop();
        isRecordingAudio = false;
        document.getElementById("voice-record-btn").innerText = "🎙️";
    }
}

// 8. Reactions & Message Deletion Pipeline
function sendReaction(emoji) {
    closeReactionModal();
    renderReactionLocal(selectedMsgIdForContext, emoji);
    broadcastToMesh({ type: "reaction", msgId: selectedMsgIdForContext, emoji: emoji });
}

function renderReactionLocal(msgId, emoji) {
    const card = document.getElementById(msgId);
    if (!card) return;
    let badge = card.querySelector(".reaction-badge");
    if (!badge) { badge = document.createElement("span"); badge.className = "reaction-badge"; card.appendChild(badge); }
    badge.innerText = emoji;
}

function triggerDeleteForEveryone() {
    closeReactionModal();
    const card = document.getElementById(selectedMsgIdForContext);
    if (card && card.getAttribute("data-sender") === userGhostID) {
        renderDeleteLocal(selectedMsgIdForContext);
        broadcastToMesh({ type: "delete", msgId: selectedMsgIdForContext });
    } else {
        alert("You can only delete your own sent messages!");
    }
}

// 9. LIVE P2P VOICE AND VIDEO CALLING ENGINE (WebRTC Implementation)
function initiateP2PCall(callType) {
    if (activeConnections.length === 0) { alert("Please connect to a live peer node first before calling."); return; }
    const targetPeerNodeID = activeConnections[0].peer; // Calls your actively connected node

    document.getElementById("call-screen").classList.remove("hidden");
    document.getElementById("call-status-label").innerText = `📞 Outgoing P2P ${callType === 'video' ? 'Video' : 'Voice'} Call...`;
    document.getElementById("call-peer-label").innerText = `Target: ${targetPeerNodeID}`;
    
    const constraints = { audio: true, video: callType === 'video' };
    
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        localMediaStream = stream;
        if (callType === 'video') {
            document.getElementById("video-grid").classList.remove("hidden");
            document.getElementById("local-video").srcObject = stream;
        }
        
        // Initiate the WebRTC call channel via PeerJS
        activeP2PCallInstance = myPeerInstance.call(targetPeerNodeID, stream, { metadata: { type: callType } });
        attachCallStreamListeners(activeP2PCallInstance);
    }).catch(err => {
        console.error("Hardware access error:", err);
        alert("Unable to open hardware video/audio lines.");
        endCurrentCall();
    });
}

function attachCallStreamListeners(callObj) {
    callObj.on('stream', remoteStream => {
        document.getElementById("call-status-label").innerText = "🟩 Call Connected Live";
        if (callObj.metadata && callObj.metadata.type === 'video') {
            document.getElementById("video-grid").classList.remove("hidden");
            document.getElementById("remote-video").srcObject = remoteStream;
        } else {
            // Voice call setup attaches audio feed invisibly
            document.getElementById("remote-video").srcObject = remoteStream;
            document.getElementById("video-grid").classList.add("hidden");
        }
    });
    
    callObj.on('close', () => { endCurrentCallLocalFlow(); });
    callObj.on('error', () => { endCurrentCallLocalFlow(); });
}

function handleIncomingCallSetup(incomingCall) {
    pendingIncomingCallEvent = incomingCall;
    document.getElementById("call-screen").classList.remove("hidden");
    document.getElementById("call-status-label").innerText = `🔔 Incoming P2P ${incomingCall.metadata.type === 'video' ? 'Video' : 'Voice'} Call...`;
    document.getElementById("call-peer-label").innerText = `From: ${incomingCall.peer}`;
    document.getElementById("accept-call-btn").classList.remove("hidden");
}

function acceptIncomingCall() {
    document.getElementById("accept-call-btn").classList.add("hidden");
    const callType = pendingIncomingCallEvent.metadata.type;
    
    navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' }).then(stream => {
        localMediaStream = stream;
        if (callType === 'video') {
            document.getElementById("video-grid").classList.remove("hidden");
            document.getElementById("local-video").srcObject = stream;
        }
        pendingIncomingCallEvent.answer(stream);
        attachCallStreamListeners(pendingIncomingCallEvent);
    }).catch(() => {
        alert("Hardware allocation failed.");
        endCurrentCall();
    });
}

function endCurrentCall() {
    if (activeP2PCallInstance) activeP2PCallInstance.close();
    if (pendingIncomingCallEvent) pendingIncomingCallEvent.close();
    endCurrentCallLocalFlow();
}

function endCurrentCallLocalFlow() {
    if (localMediaStream) {
        localMediaStream.getTracks().forEach(track => track.stop());
    }
    localMediaStream = null;
    activeP2PCallInstance = null;
    pendingIncomingCallEvent = null;
    
    document.getElementById("remote-video").srcObject = null;
    document.getElementById("local-video").srcObject = null;
    document.getElementById("call-screen").classList.add("hidden");
    document.getElementById("accept-call-btn").classList.add("hidden");
    document.getElementById("video-grid").classList.add("hidden");
}

// 10. Core P2P Mesh Pipeline Management
function initializeMeshNetwork() {
    myPeerInstance = new Peer(userGhostID);
    myPeerInstance.on('open', (id) => updateSystemStatus("System: Broadcast node live. ID: " + id));
    myPeerInstance.on('connection', (incomingConn) => setupConnectionListeners(incomingConn));
    
    // Listen for incoming audio/video call handshakes
    myPeerInstance.on('call', (incomingCall) => handleIncomingCallSetup(incomingCall));
    myPeerInstance.on('error', () => updateSystemStatus("Mesh networking handshake syncing..."));
}

function connectFromUI() {
    const targetPeerID = document.getElementById("peer-id-input").value.trim();
    if (targetPeerID === "" || targetPeerID === userGhostID) return;
    if (activeConnections.some(conn => conn.peer === targetPeerID)) { closeConnectModal(); return; }
    
    updateSystemStatus(`Linking to: ${targetPeerID}...`);
    const outboundConn = myPeerInstance.connect(targetPeerID);
    setupConnectionListeners(outboundConn);
    closeConnectModal();
}

function setupConnectionListeners(conn) {
    conn.on('open', () => {
        updateSystemStatus(`Connected to ${conn.peer}!`);
        if (!activeConnections.some(c => c.peer === conn.peer)) activeConnections.push(conn);
        conn.send({ type: "dp-update", sender: userGhostID, dpData: userCurrentDP });
    });

    conn.on('data', (data) => {
        if (!data) return;
        if (data.type === "chat") {
            appendMessage(data.sender, data.text, "incoming", data.msgId, data.senderDP, data.contentType, data.mediaPayload, data.viewOnce);
            if (conn.open) conn.send({ type: "ack", msgId: data.msgId });
        } 
        else if (data.type === "typing") {
            const indicator = document.getElementById("typing-indicator");
            if (data.isTyping) { indicator.innerText = `${data.sender} is typing...`; indicator.classList.remove("hidden"); }
            else { indicator.classList.add("hidden"); }
        }
        else if (data.type === "ack") {
            const tick = document.getElementById(`tick-${data.msgId}`);
            if (tick) { tick.innerText = " ✓✓"; tick.style.color = "#00f2fe"; }
        }
        else if (data.type === "dp-update") {
            window["dp_" + data.sender] = data.dpData;
            document.querySelectorAll(`.msg-avatar-${data.sender}`).forEach(img => img.src = data.dpData);
        }
        else if (data.type === "reaction") { renderReactionLocal(data.msgId, data.emoji); }
        else if (data.type === "delete") { renderDeleteLocal(data.msgId); }
        else if (data.type === "view-once-burn") {
            const card = document.getElementById(data.msgId);
            if (card) card.innerHTML = `<div class="view-once-locked">❶ Secret Opened & Burned</div>`;
        }
    });

    conn.on('close', () => { activeConnections = activeConnections.filter(c => c.peer !== conn.peer); });
}

function renderDeleteLocal(msgId) {
    const card = document.getElementById(msgId);
    if (!card) return;
    const txtNode = card.querySelector(".msg-text-content");
    if (txtNode) { txtNode.innerText = "🚫 This message was deleted"; txtNode.style.fontStyle = "italic"; txtNode.style.opacity = "0.5"; }
    const mediaNode = card.querySelector(".media-content");
    if (mediaNode) mediaNode.remove();
}

// 11. Transmission Systems
function sendMessage() {
    const msgInput = document.getElementById("msg-input");
    const txt = msgInput.value.trim();
    if (txt === "") return;
    
    const cleanText = txt.toLowerCase();
    for (let i = 0; i < bannedWords.length; i++) {
        if (cleanText.includes(bannedWords[i])) { alert("⚠️ Security Violation!"); msgInput.value = ""; return; }
    }
    sendMessageBundle("text", txt);
    msgInput.value = "";
}

function sendMessageBundle(contentType, payload) {
    const uniqueMsgId = "msg-" + Date.now();
    let textDisplay = contentType === "text" ? payload : "";
    appendMessage(userGhostID, textDisplay, "outgoing", uniqueMsgId, userCurrentDP, contentType, payload, isViewOnceEnabled);
    broadcastToMesh({
        type: "chat", msgId: uniqueMsgId, sender: userGhostID, text: textDisplay,
        senderDP: userCurrentDP, contentType: contentType, mediaPayload: payload, viewOnce: isViewOnceEnabled
    });
    if (isViewOnceEnabled) toggleViewOnceMode();
}

function broadcastToMesh(obj) { activeConnections.forEach(conn => { if (conn.open) conn.send(obj); }); }

// 12. UI Architecture Layout Rendering Engine
function appendMessage(sender, text, direction, msgId, avatarSrc, contentType, mediaPayload, viewOnce) {
    const container = document.getElementById("messages-container");
    const card = document.createElement("div");
    card.id = msgId; card.setAttribute("data-sender", sender);
    card.style.display = "flex"; card.style.gap = "10px"; card.style.alignItems = "flex-start";
    card.className = direction === "outgoing" ? "card outgoing outgoing-row" : "card incoming";
    card.onclick = () => openReactionModal(msgId);

    const imgNode = document.createElement("img");
    imgNode.src = avatarSrc || window["dp_" + sender] || "https://api.dicebear.com/7.x/bottts/svg?seed=" + sender;
    imgNode.className = `msg-avatar-${sender}`;
    imgNode.style.width = "30px"; imgNode.style.height = "30px"; imgNode.style.borderRadius = "50%"; imgNode.style.flexShrink = "0";

    const contentDiv = document.createElement("div");
    const senderDiv = document.createElement("div"); senderDiv.className = "sender"; senderDiv.innerText = sender;
    if (direction === "outgoing") senderDiv.style.display = "none";
    contentDiv.appendChild(senderDiv);

    const txtNode = document.createElement("div");
    txtNode.className = "msg-text-content"; txtNode.innerText = text;
    contentDiv.appendChild(txtNode);

    if (viewOnce && direction === "incoming") {
        txtNode.innerHTML = `<div class="view-once-locked" id="lock-${msgId}">❶ Click to View Secret Media</div>`;
        card.onclick = () => {
            if (txtNode.querySelector(".view-once-locked").innerText.includes("Burned")) return;
            renderActualMedia(txtNode, contentType, mediaPayload);
            setTimeout(() => {
                txtNode.innerHTML = `<div class="view-once-locked">❶ Secret Opened & Burned</div>`;
                broadcastToMesh({ type: "view-once-burn", msgId: msgId });
            }, 8000);
        };
    } else {
        renderActualMedia(txtNode, contentType, mediaPayload);
    }

    if (direction === "outgoing") {
        const tick = document.createElement("span"); tick.id = `tick-${msgId}`; tick.innerText = " ✓"; tick.style.fontSize = "11px"; tick.style.color = "#a6b4be"; tick.style.marginLeft = "5px";
        txtNode.appendChild(tick);
        if (viewOnce) {
            const vBadge = document.createElement("span"); vBadge.innerText = " (❶ View Once)"; vBadge.style.fontSize = "10px"; vBadge.style.color = "#ff4a4a";
            txtNode.appendChild(vBadge);
        }
    }

    card.appendChild(imgNode); card.appendChild(contentDiv); container.appendChild(card);
    container.scrollTop = container.scrollHeight;
}

function renderActualMedia(targetNode, type, payload) {
    if (type === "media" && payload) {
        if (payload.fileType.startsWith("image/")) { targetNode.innerHTML += `<img src="${payload.fileData}" class="shared-img media-content">`; } 
        else if (payload.fileType.startsWith("video/")) { targetNode.innerHTML += `<video src="${payload.fileData}" controls class="shared-video media-content"></video>`; } 
        else { targetNode.innerHTML += `<div class="media-content" style="margin-top:5px;"><a href="${payload.fileData}" download="${payload.fileName}" style="color:#00f2fe; text-decoration:underline;">📁 ${payload.fileName}</a></div>`; }
    } else if (type === "audio" && payload) {
        targetNode.innerHTML += `<audio src="${payload}" controls class="media-content" style="margin-top:5px; max-width:220px;"></audio>`;
    }
}

function setupTypingListener() {
    const input = document.getElementById("msg-input");
    if (!input) return;
    input.addEventListener("input", () => {
        broadcastToMesh({ type: "typing", sender: userGhostID, isTyping: true });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => broadcastToMesh({ type: "typing", sender: userGhostID, isTyping: false }), 2000);
    });
}

function updateSystemStatus(status) {
    const container = document.getElementById("messages-container");
    const sys = document.createElement("div"); sys.className = "system-msg"; sys.innerText = status;
    container.appendChild(sys); container.scrollTop = container.scrollHeight;
}
