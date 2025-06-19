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
        maxHp: 3000,
        atk: 45,
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

    "Terrmor_2": {
        name: "테르모르",
        type: "나무",
        maxHp: 4000,
        atk: 35,
        matk: 20,
        def: 45,
        mdef: 20,
        skills: ["SKILL_Birth_of_Vines", "SKILL_Spores_of_Silence", "SKILL_Seeds_Wrath"],
        gimmicks: ["GIMMICK_Path_of_Ruin", "GIMMICK_Seed_of_Devour"] // 순서대로 발동
    },

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
        name: "A-2. 생명의 터전",
        flavorText: "대지에 박혀 있던 바위에 서서히 금이 가기 시작한다.\n갈라진 틈에서 가느다란 뿌리들이 자라나고,\n단단한 표면 위로 덩굴이 뒤엉키듯 솟아오른다.\n억눌러 왔던 생명이, 대지의 껍질을 완전히 벗겨낸 생명의 형상이,\n바위 위에서 기어코 개화한다.\n\"대지 위에서 피어나는 것들은 모두 고통스러울 것이니.\"",
        deathScript: "테르모르의 팔이 천천히 꺾이며 내려앉는다.\n몸을 덮고 있던 꽃잎이 시들며 무너지고, 마지막 하나가 바람 없이 떨어진다.\n대지에는 더 이상 살아 있는 기척조차 남지 않았으며,\n조용히 무너진 몸 아래, 메마른 뿌리만이 그 자리에 남는다.\n\"봄은, 다시 움트지 않으리라.\"",
        enemies: [
            { templateId: "Terrmor_2", pos: { x: 2, y: 2 } }
        ]
    },
    
    "B-1": {
        name: "B-1: 인형극장",
        enemies: [
            { templateId: "Carnabloom_1", pos: { x: 4, y: 4 } },
            { templateId: "Pierrot", pos: { x: 3, y: 4 } }
        ]
    },
    
    "B-2": {
        name: "B-2: 달의 그네",
        enemies: [
            { templateId: "Carnabloom_2", pos: { x: 4, y: 4 } },
            { templateId: "Clown", pos: { x: 3, y: 4 } }
        ]
    }
};

const GIMMICK_DATA = {
    "GIMMICK_Aegis_of_Earth1": { 
        name: "대지의 수호(동)",
        coords: "3,1;3,2;3,3;4,0;4,1;4,2;4,3;4,4",
        flavorText: "우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 성벽 또한 작은 균열 하나에 허물어지는 법.\n\"무딘 칼날로 대지를 가를 수 있겠는가?\""
    },
    "GIMMICK_Aegis_of_Earth2": { 
        name: "대지의 수호(서)",
        coords: "0,0;0,1;0,2;0,3;0,4;1,1;1,2;1,3",
        flavorText: "우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 성벽 또한 작은 균열 하나에 허물어지는 법.\n\"무딘 칼날로 대지를 가를 수 있겠는가?\""
    },
    "GIMMICK_Aegis_of_Earth3": { 
        name: "대지의 수호(남)",
        coords: "1,3;2,3;3,3;0,4;1,4;2,4;3,4;4,4",
        flavorText: "우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 성벽 또한 작은 균열 하나에 허물어지는 법.\n\"무딘 칼날로 대지를 가를 수 있겠는가?\""
    },
    
    "GIMMICK_Aegis_of_Earth4": { 
        name: "대지의 수호(북)",
        coords: "0,0;1,0;2,0;3,0;4,0;1,1;2,1;3,1",
        flavorText: "우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 성벽 또한 작은 균열 하나에 허물어지는 법.\n\"무딘 칼날로 대지를 가를 수 있겠는가?\""
    },

    "GIMMICK_Path_of_Ruin": {
        name: "균열의 길",
        description: "무작위 행과 열에 공격을 예고합니다. 1턴 뒤 예고된 타일에 피해를 줍니다. 해당 타일에 아군이 없으면 파훼 성공.",
        success: "보스에게 [붕괴] 디버프(방어력/마법 방어력 30% 감소, 2턴) 부여.",
        failure: "범위 내 아군에게 (마법 공격력) 피해 및 [무장 해제](공격 스킬 사용 불가, 1턴) 부여.",
        script: "균열이 퍼지며, 땅 아래서 검은 뿌리가 꿈틀댄다.\n번져오는 재해 앞에서 길을 찾아야 한다.\n\"생명의 뿌리를 꺾을 수 있다고 믿는가?\""
    },
    
    "GIMMICK_Seed_of_Devour": {
        name: "흡수의 술식",
        description: "세 가지 형태의 기믹 중 하나가 무작위로 발동합니다.",
        subGimmick1: {
            name: "열매 파괴",
            script: "생명의 씨앗들이 고개를 들기 시작한다.\n이 씨앗들이 결실을 맺지 못하도록 꺾어야 한다.\n\"씨앗은 생명을 흡수해, 다시 죽음을 틔운다.\"",
            description: "맵에 2개의 열매가 생성됩니다. 3턴 내에 모두 파괴하세요."
        },
        subGimmick2: {
            name: "불안정한 균열",
            script: "생명의 씨앗들이 뿌리를 내리기 시작한다.\n단단하게 내린 뿌리가 우리를 옭아맬 것이다.\n\"뿌리는 뽑아도 뽑히지 않고, 다시 죽음을 틔운다.\"",
            description: "맵에 3개의 [불안정한 균열] 지대가 생성됩니다. 3턴 뒤 폭발하며, 아군이 위에 서서 폭발을 막아야 합니다."
        },
        subGimmick3: {
            name: "메마른 생명의 샘",
            script: "생명의 씨앗들이 메마른 땅에서 목을 축인다.\n굶주린 씨앗들은 분노할 것이다.\n\"마른 땅에서도 씨앗은 움트니, 비로소 생명이 된다.\"",
            description: "맵에 '메마른 생명의 샘'이 생성됩니다. 3턴 내에 50 이상의 생명력을 회복시키세요."
        }
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
function renderMapGrid(mapContainerElement, allyChars, enemyChars, activeAreaEffects = [], previewedHitArea = []) {
    if (!mapContainerElement) return;
    mapContainerElement.innerHTML = '';

    // 예고된 스킬 범위를 Set으로 만들어 빠른 조회를 위함
    const previewCoordSet = new Set(previewedHitArea.map(p => `${p.x},${p.y}`));

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

            // 신규 추가: 스킬 예고 범위에 CSS 클래스 추가
            if (previewCoordSet.has(key)) {
                cellDiv.classList.add('skill-preview-zone');
            }

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
