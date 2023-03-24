const socket = io();

const myFace = document.getElementById("myFace");
const muteBtn = document.getElementById("mute");
const cameraBtn = document.getElementById("camera");
const camerasSelect = document.getElementById("cameras");
const call = document.getElementById("call");

const dragArea = document.getElementById("dragArea");
const donwloadAnchor = document.getElementById("download");

call.hidden = true;

let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let myPeerConnection;
let myDataChannel;
let receivedBuffer = [];
let fileSize;

async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label === camera.label) {
        option.selected = true;
      }
      camerasSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}

async function getMedia(deviceId) {
  const initialConstrains = {
    audio: true,
    video: { facingMode: "user" },
  };
  const cameraConstraints = {
    audio: true,
    video: { deviceId: { exact: deviceId } },
  };
  try {
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId ? cameraConstraints : initialConstrains
    );
    myFace.srcObject = myStream;
    if (!deviceId) {
      await getCameras();
    }
  } catch (e) {
    console.log(e);
  }
}

function handleMuteClick() {
  myStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (!muted) {
    muteBtn.innerText = "Unmute";
    muted = true;
  } else {
    muteBtn.innerText = "Mute";
    muted = false;
  }
}
function handleCameraClick() {
  myStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (cameraOff) {
    cameraBtn.innerText = "Turn Camera Off";
    cameraOff = false;
  } else {
    cameraBtn.innerText = "Turn Camera On";
    cameraOff = true;
  }
}

async function handleCameraChange() {
  await getMedia(camerasSelect.value);
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);

// Welcome Form (join a room)

const welcome = document.getElementById("welcome");
const welcomeForm = welcome.querySelector("form");

async function initCall() {
  welcome.hidden = true;
  call.hidden = false;
  await getMedia();
  makeConnection();
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = welcomeForm.querySelector("input");
  await initCall();
  socket.emit("join_room", input.value);
  roomName = input.value;
  input.value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);

// Socket Code

socket.on("welcome", async () => {
  myDataChannel = myPeerConnection.createDataChannel("chat");
  myDataChannel.addEventListener("message", (event) => {
    console.log("here");
    const receivedData = JSON.parse(event.data);
    if (receivedBuffer === undefined) {
      return;
    }
    if (receivedData.status === 0) {
      receivedBuffer = [];
      fileSize = receivedData.size;
    } else {
      receivedBuffer.push(receivedData.payload);
      if (receivedBuffer.length === fileSize) {
        receivedBuffer = [];
        fileSize = 0;
        const file = new Blob(receivedBuffer);
        donwloadAnchor.href = URL.createObjectURL(file);
        donwloadAnchor.textContent = "click to download";
        donwloadAnchor.style.display = "block";
      }
    }
  });
  console.log("made data channel");
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  console.log("sent the offer");
  socket.emit("offer", offer, roomName);
});

socket.on("offer", async (offer) => {
  myPeerConnection.addEventListener("datachannel", (event) => {
    myDataChannel = event.channel;
    console.log("here event channel ", event.channel);

    myDataChannel.addEventListener("message", (event) => {
      console.log("got message", event.data);
      const receivedData = JSON.parse(event.data);
      console.log(receivedData);
      if (receivedBuffer === undefined) {
        console.log("or here? ");

        return;
      }
      if (receivedData.status === 0) {
        console.log("is it here? ", receivedBuffer.length === fileSize);

        receivedBuffer = [];
        fileSize = receivedData.size;
        receivedBuffer.push(Uint8Array.from(receivedData.payload));
      } else {
        receivedBuffer.push(Uint8Array.from(receivedData.payload));
        console.log("has it reached? ", receivedBuffer, fileSize);
        if (receivedBuffer.length === Math.ceil(fileSize / 16384)) {
          console.log("hellllll ya");
          const file = new Blob(receivedBuffer);
          console.log(file);
          donwloadAnchor.href = URL.createObjectURL(file);
          donwloadAnchor.download = receivedData.name;
          donwloadAnchor.textContent = "click to download";
          donwloadAnchor.style.display = "block";
          receivedBuffer = [];
          fileSize = 0;
        }
      }
    });
  });
  console.log("received the offer");
  myPeerConnection.setRemoteDescription(offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("answer", answer, roomName);
  console.log("sent the answer");
});

socket.on("answer", (answer) => {
  console.log("received the answer");
  myPeerConnection.setRemoteDescription(answer);
});

socket.on("ice", (ice) => {
  console.log("received candidate");
  myPeerConnection.addIceCandidate(ice);
});

// RTC Code

function makeConnection() {
  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });
  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddStream);
  // myStream
  //   .getTracks()
  //   .forEach((track) => myPeerConnection.addTrack(track, myStream));
}

function handleIce(data) {
  console.log("sent candidate");
  socket.emit("ice", data.candidate, roomName);
}

function handleAddStream(data) {
  const peerFace = document.getElementById("peerFace");
  peerFace.srcObject = data.stream;
}

// send file
dragArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dragArea.classList.remove("drag-over");
});
dragArea.addEventListener("dragleave", () => {
  dragArea.classList.remove("drag-over");
});
dragArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dragArea.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  const fileReader = new FileReader(file);
  fileReader.readAsArrayBuffer(file);
  console.log("read as ", fileReader);
  const dataJson = {
    payload: "hi",
  };
  myDataChannel.send(JSON.stringify(dataJson));
  fileReader.onload = (e) => {
    console.log("file data ", e.target.result);
    sendData(e.target.result, file.name);
  };
});

async function sendData(data, name) {
  const chunkSize = 16384;
  let offset = 0;
  fileReader = new FileReader();
  console.log(data);

  while (offset < data.byteLength) {
    const chunk = data.slice(offset, offset + chunkSize);
    console.log(chunk);
    const dataJson = {
      type: "data transfer",
      status: offset,
      size: data.byteLength,
      payload: Array.from(new Uint8Array(chunk)),
      name: name,
    };
    myDataChannel.send(JSON.stringify(dataJson));
    offset += chunkSize;
    await new Promise((res) => setTimeout(res, 100));
  }
  console.log("transfer sended");
}
