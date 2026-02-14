import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAOd24AzDmA609KAaa_4frTMnAeY8mJrXM",
  authDomain: "raid-simulator-1999.firebaseapp.com",
  databaseURL: "https://raid-simulator-1999-default-rtdb.firebaseio.com",
  projectId: "raid-simulator-1999",
  storageBucket: "raid-simulator-1999.firebasestorage.app",
  messagingSenderId: "112905026016",
  appId: "1:112905026016:web:419f84388bae3e6291d385",
  measurementId: "G-P176XFZWH2"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 전역 변수
let MAP_WIDTH = 5;
let MAP_HEIGHT = 5;

// --- 캐릭터 카드 생성 (플레이어 뷰 전용) ---
function createPlayerViewCharacterCard(character, team) {
    const card = document.createElement('div');
    card.className = 'character-stats';

    let cardHTML = '';

    if (team === 'ally') {
        // 아군은 모든 정보를 표시
        cardHTML = `
            <p><strong>${character.name} (${character.type}) (${character.job})</strong> ${character.posX !== -1 ? `[${character.posX},${character.posY}]` : ''}</p>
            <p>HP: ${character.currentHp.toFixed(0)} / ${character.maxHp.toFixed(0)} ${character.shield > 0 ? `(+${character.shield.toFixed(0)}🛡️)` : ''}</p>
            <p>공격력: ${character.atk.toFixed(0)} | 마법 공격력: ${character.matk.toFixed(0)}</p>
            <p>방어력: ${character.def.toFixed(0)} | 마법 방어력: ${character.mdef.toFixed(0)}</p>
            <p>상태: ${character.isAlive ? '생존' : '<span style="color:red;">쓰러짐</span>'}</p>
            ${character.buffs.length > 0 ? `<p>버프: ${character.buffs.map(b => `${b.name}(${b.turnsLeft}턴${b.stacks > 1 ? `x${b.stacks}` : ''})`).join(', ')}</p>` : ''}
            ${character.debuffs.length > 0 ? `<p>디버프: ${character.debuffs.map(d => `${d.name}(${d.turnsLeft}턴${d.stacks > 1 ? `x${d.stacks}`:''})`).join(', ')}</p>` : ''}
        `;
    } else { // team === 'enemy'
        // 적군은 체력, 스탯을 제외한 정보만 표시
        cardHTML = `
            <p><strong>${character.name} (${character.type})</strong> ${character.posX !== -1 ? `[${character.posX},${character.posY}]` : ''}</p>
            <p>상태: ${character.isAlive ? '생존' : '<span style="color:red;">쓰러짐</span>'}</p>
            ${character.buffs.length > 0 ? `<p>버프: ${character.buffs.map(b => `${b.name}(${b.turnsLeft}턴${b.stacks > 1 ? `x${b.stacks}` : ''})`).join(', ')}</p>` : ''}
            ${character.debuffs.length > 0 ? `<p>디버프: ${character.debuffs.map(d => `${d.name}(${d.turnsLeft}턴${d.stacks > 1 ? `x${d.stacks}`:''})`).join(', ')}</p>` : ''}
        `;
    }
    card.innerHTML = cardHTML;
    return card;
}

// --- 화면 표시 업데이트 (플레이어 뷰 전용) ---
function displayPlayerViewCharacters(allyChars = [], enemyChars = []) {
    const allyDisplay = document.getElementById('allyCharacters');
    const enemyDisplay = document.getElementById('enemyCharacters');

    // allyChars가 undefined일 경우를 대비해 안전하게 체크
    if (!Array.isArray(allyChars) || allyChars.length === 0) {
        allyDisplay.innerHTML = '<p>아군 캐릭터가 없습니다.</p>';
    } else {
        allyDisplay.innerHTML = '';
        allyChars.forEach(char => allyDisplay.appendChild(createPlayerViewCharacterCard(char, 'ally')));
    }

    if (!Array.isArray(enemyChars) || enemyChars.length === 0) {
        enemyDisplay.innerHTML = '<p>적군 캐릭터가 없습니다.</p>';
    } else {
        enemyDisplay.innerHTML = '';
        enemyChars.forEach(char => enemyDisplay.appendChild(createPlayerViewCharacterCard(char, 'enemy')));
    }
}


// --- 데이터를 읽어와 전체 화면을 갱신하는 함수 ---
function renderGameState(state) {
    if (!state) return;
    
    // 데이터가 없을 경우를 대비해 기본값 []를 설정
    const allies = state.allies || []; 
    const enemies = state.enemies || [];
    const mapObjects = state.mapObjects || [];
    const mapWidth = state.mapWidth || 5;
    const mapHeight = state.mapHeight || 5;
    const enemyPreviewAction = state.enemyPreviewAction || null;
    
    MAP_WIDTH = mapWidth;
    MAP_HEIGHT = mapHeight;

    // 캐릭터 정보 업데이트
    displayPlayerViewCharacters(allies, enemies);

    // 맵 업데이트
    const mapGridContainer = document.getElementById('mapGridContainer');
    const previewedHitArea = enemyPreviewAction ? enemyPreviewAction.hitArea : [];
    const previewedSkillId = enemyPreviewAction ? enemyPreviewAction.skillId : null;
    
    renderMapGrid(mapGridContainer, allies, enemies, mapObjects, [], previewedHitArea, previewedSkillId, MAP_WIDTH, MAP_HEIGHT);
}

// --- 이벤트 리스너 설정 ---
document.addEventListener('DOMContentLoaded', () => {
    // Firebase 데이터베이스의 'raid/state' 경로를 감시
    const stateRef = ref(db, 'raid/state');
    
    // 데이터가 변경될 때마다 실행되는 리스너
    onValue(stateRef, (snapshot) => {
        const data = snapshot.val();
        
        console.log("Firebase 수신 데이터:", data);

        if (data) {
            try {
                const stateForRender = {
                    allies: data.allies || [],
                    enemies: data.enemies || [],
                    mapObjects: data.mapObjects || [],
                    mapWidth: data.mapWidth || 5,
                    mapHeight: data.mapHeight || 5,
                    enemyPreviewAction: data.enemyPreviewAction || null
                };
                
                renderGameState(stateForRender);
            } catch (e) {
                console.error("화면 갱신 중 오류 발생:", e);
            }
        } else {
            console.warn("Firebase 경로('raid/state')에 데이터가 없습니다. 시뮬레이터에서 데이터를 먼저 전송하세요.");
        }
    });
});
