// Mapdata.js

/**
 * 몬스터의 기본 정보 템플릿입니다.
 * 'map/monster data - 몬스터 데이터.csv' 파일의 내용을 기반으로 합니다.
 * 지금은 렌더링에 필요한 이름과 타입 정보만 사용합니다.
 */

const MONSTER_TEMPLATES = {
    // 1. 고정 타입을 갖는 몬스터
    "Terrmor_1": {
        name: "테르모르",
        type: "암석",
        maxHp: 500,
        atk: 35,
        matk: 20,
        def: 35,
        mdef: 20,
        skills: [
            "SKILL_Seismic_Fissure",
            "SKILL_Echo_of_Silence",
            "SKILL_Crushing_Sky"
        ],
        gimmicks: [
            "GIMMICK_Aegis_of_Earth1",
            "GIMMICK_Aegis_of_Earth2",
            "GIMMICK_Aegis_of_Earth3",
            "GIMMICK_Aegis_of_Earth4"
        ]
    },

    "Terrmor_2": { name: "테르모르", type: "나무" },
    "Carnabloom_1": { name: "카르나블룸", type: "야수" },
    "Carnabloom_2": { name: "카르나블룸", type: "천체" },

    // 2. 랜덤 타입을 갖는 몬스터
    "Pierrot": { name: "삐에로", type: ["암석", "나무"] },
    "Clown": { name: "클라운", type: ["암석", "나무"] }
};

const MAP_CONFIGS = {
    "A-1": {
        name: "A-1: 황폐한 대지",
        enemies: [
            { templateId: "Terrmor_1", pos: { x: 2, y: 2 } }
        ],
        flavorText: // ➁
            "거대한 바위가 자연의 중심처럼 눌러앉아 있다. 그것은 그저 풍경처럼 존재하나,\n" +
            "땅이 울리고, 균열이 일어나면, 바위의 틈 사이로 희미한 숨결이 들려온다. 대지는 이미 깨어나고 있다.\n" +
            "\"그 누가 잠든 대지를 일깨우느냐.\""
    },

    "A-2": {
        name: "A-2: 생명의 터전",
        enemies: [ { templateId: "Terrmor_2", pos: { x: 2, y: 2 } } ]
    },
    "B-1": {
        name: "B-1: 인형극장",
        enemies: [
            { templateId: "Carnabloom_1", pos: { x: 4, y: 4 } },
            { templateId: "Pierrot", pos: { x: 3, y: 4 } }
        ]
    }, // <-- 쉼표 추가
    "B-2": {
        name: "B-2: 달의 그네",
        enemies: [
            { templateId: "Carnabloom_2", pos: { x: 4, y: 4 } },
            { templateId: "Clown", pos: { x: 3, y: 4 } }
        ]
    }
};

const GIMMICK_DATA = {
    "GIMMICK_Aegis_of_Earth1": { // ➆
        name: "대지의 수호(동)",
        coords: "3,1;3,2;3,3;4,0;4,1;4,2;4,3;4,4",
        flavorText: "우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 성벽 또한 작은 균열 하나에 허물어지는 법.\n\"무딘 칼날로 대지를 가를 수 있겠는가?\""
    },
    "GIMMICK_Aegis_of_Earth2": { // ➇
        name: "대지의 수호(서)",
        coords: "0,0;0,1;0,2;0,3;0,4;1,1;1,2;1,3",
        flavorText: "우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 성벽 또한 작은 균열 하나에 허물어지는 법.\n\"무딘 칼날로 대지를 가를 수 있겠는가?\""
    },
    "GIMMICK_Aegis_of_Earth3": { // ➈
        name: "대지의 수호(남)",
        coords: "1,3;2,3;3,3;0,4;1,4;2,4;3,4;4,4",
        flavorText: "우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 성벽 또한 작은 균열 하나에 허물어지는 법.\n\"무딘 칼날로 대지를 가를 수 있겠는가?\""
    },
    "GIMMICK_Aegis_of_Earth4": { // ➉
        name: "대지의 수호(북)",
        coords: "0,0;1,0;2,0;3,0;4,0;1,1;2,1;3,1",
        flavorText: "우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 성벽 또한 작은 균열 하나에 허물어지는 법.\n\"무딘 칼날로 대지를 가를 수 있겠는가?\""
    }
};

// --- 추가: 클라운과 삐에로의 시작 지점(소환 지점) 정의 ---
// 좌표는 (0,0)을 기준으로 합니다.
const SPAWN_POINTS = {
    "Clown": [ // 빨간색 시작 지점
        { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 2 }, { x: 4, y: 2 }
    ],
    "Pierrot": [ // 파란색 시작 지점
        { x: 2, y: 0 }, { x: 0, y: 4 }, { x: 2, y: 4 }, { x: 4, y: 4 }
    ]
};

/**
 * 맵 그리드와 캐릭터 위치를 화면에 그리는 함수입니다.
 */
function renderMapGrid(mapContainerElement, allyChars, enemyChars, activeAreaEffects = []) {
    if (!mapContainerElement) return;
    mapContainerElement.innerHTML = '';

    // 스폰 지점 좌표를 Set으로 만들어 빠른 조회
    const clownSpawns = new Set(SPAWN_POINTS.Clown.map(p => `${p.x},${p.y}`));
    const pierrotSpawns = new Set(SPAWN_POINTS.Pierrot.map(p => `${p.x},${p.y}`));

    const gridCharMap = {};
    [...allyChars, ...enemyChars].forEach(char => {
        if (char.isAlive && char.posX !== -1 && char.posY !== -1) {
            const key = `${char.posX},${char.posY}`;
            if (!gridCharMap[key]) gridCharMap[key] = [];
            const nameInitial = char.name.length > 1 ? char.name.substring(0,2) : char.name.substring(0,1);
            gridCharMap[key].push({ initial: nameInitial, team: (allyChars.includes(char) ? 'ally' : 'enemy') });
        }
    });

    for (let y = 0; y < MAP_HEIGHT; y++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'map-row';
        for (let x = 0; x < MAP_WIDTH; x++) {
            const cellDiv = document.createElement('div');
            cellDiv.className = 'map-cell';
            const key = `${x},${y}`;

            // 스폰 지점에 CSS 클래스 추가
            if (clownSpawns.has(key)) cellDiv.classList.add('clown-spawn');
            if (pierrotSpawns.has(key)) cellDiv.classList.add('pierrot-spawn');

            if (gridCharMap[key]) {
                gridCharMap[key].forEach(c => {
                    const charMarker = document.createElement('span');
                    charMarker.className = `char-marker ${c.team}`;
                    charMarker.textContent = c.initial;
                    cellDiv.appendChild(charMarker);
                });
            }
            rowDiv.appendChild(cellDiv);
        }
        mapContainerElement.appendChild(rowDiv);
    }
}
