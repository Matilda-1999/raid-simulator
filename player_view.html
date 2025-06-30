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
function displayPlayerViewCharacters(allyChars, enemyChars) {
    const allyDisplay = document.getElementById('allyCharacters');
    const enemyDisplay = document.getElementById('enemyCharacters');

    allyDisplay.innerHTML = allyChars.length === 0 ? '<p>아군 캐릭터가 없습니다.</p>' : '';
    allyChars.forEach(char => allyDisplay.appendChild(createPlayerViewCharacterCard(char, 'ally')));

    enemyDisplay.innerHTML = enemyChars.length === 0 ? '<p>적군 캐릭터가 없습니다.</p>' : '';
    enemyChars.forEach(char => enemyDisplay.appendChild(createPlayerViewCharacterCard(char, 'enemy')));
}


// --- localStorage의 데이터를 읽어와 전체 화면을 갱신하는 함수 ---
function renderGameState(state) {
    if (!state) return;
    
    // battleLog는 더 이상 사용하지 않으므로 state에서 받지 않음
    const { allies, enemies, mapObjects, mapWidth, mapHeight, enemyPreviewAction } = state;
    
    MAP_WIDTH = mapWidth;
    MAP_HEIGHT = mapHeight;

    // 캐릭터 정보 업데이트
    displayPlayerViewCharacters(allies, enemies);

    // 맵 업데이트
    const mapGridContainer = document.getElementById('mapGridContainer');
    const previewedHitArea = enemyPreviewAction ? enemyPreviewAction.hitArea : [];
    const previewedSkillId = enemyPreviewAction ? enemyPreviewAction.skillId : null;
    
    // `renderMapGrid` 함수는 Mapdata.js에 정의되어 있으므로 호출 가능
    renderMapGrid(mapGridContainer, allies, enemies, mapObjects, [], previewedHitArea, previewedSkillId);
}

// --- 이벤트 리스너 설정 ---
document.addEventListener('DOMContentLoaded', () => {
    // 페이지가 처음 로드될 때 현재 상태를 한 번 불러옴
    const initialStateJSON = localStorage.getItem('raidSimulatorState');
    if (initialStateJSON) {
        try {
            const initialState = JSON.parse(initialStateJSON);
            renderGameState(initialState);
        } catch (e) {
            console.error("저장된 상태를 불러오는 데 실패했습니다:", e);
        }
    }
    
    // 'storage' 이벤트 리스너 추가. 다른 탭에서 localStorage가 변경되면 실행됨.
    window.addEventListener('storage', (event) => {
        if (event.key === 'raidSimulatorState') {
            try {
                const newState = JSON.parse(event.newValue);
                renderGameState(newState);
            } catch (e) {
                console.error("상태 업데이트에 실패했습니다:", e);
            }
        }
    });
});
