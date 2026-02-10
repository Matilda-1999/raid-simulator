const MONSTER_TEMPLATES = {
  // 1. 고정 타입을 갖는 몬스터
  Terrmor_1: {
    name: "테르모르",
    type: "암석",
    maxHp: 3000,
    atk: 75,
    matk: 50,
    def: 35,
    mdef: 20,
    skills: [
      "SKILL_Seismic_Fissure",
      "SKILL_Echo_of_Silence",
      "SKILL_Crushing_Sky",
    ],
    gimmicks: [
      "GIMMICK_Aegis_of_Earth1",
      "GIMMICK_Aegis_of_Earth2",
      "GIMMICK_Aegis_of_Earth3",
      "GIMMICK_Aegis_of_Earth4",
    ],
  },

  Terrmor_2: {
    name: "테르모르",
    type: "나무",
    maxHp: 4000,
    atk: 50,
    matk: 75,
    def: 20,
    mdef: 35,
    skills: [
      "SKILL_Birth_of_Vines",
      "SKILL_Spores_of_Silence",
      "SKILL_Seeds_Wrath",
    ],
    gimmicks: ["GIMMICK_Path_of_Ruin", "GIMMICK_Seed_of_Devour"],
  },

  Carnabloom_1: {
    name: "카르나블룸",
    type: "야수",
    maxHp: 4000,
    atk: 75,
    matk: 50,
    def: 35,
    mdef: 20,
    skills: ["SKILL_Thread_of_Emotion"],
    gimmicks: ["GIMMICK_Curtain_Call", "GIMMICK_Encore", "GIMMICK_Duet"],
  },

  Carnabloom_2: {
    name: "카르나블룸",
    type: "천체",
    maxHp: 5000,
    atk: 50,
    matk: 75,
    def: 20,
    mdef: 35,
    skills: ["SKILL_Play1", "SKILL_Crimson", "SKILL_Silence"],
    gimmicks: [
      "GIMMICK_Script_Reversal",
      "GIMMICK_The_Final_Curtain1",
      "GIMMICK_The_Final_Curtain2",
      "GIMMICK_Dress_Rehearsal1",
      "GIMMICK_Dress_Rehearsal2",
      "GIMMICK_Dress_Rehearsal3",
      "GIMMICK_Dress_Rehearsal4",
    ],
  },

  // 2. 랜덤 타입을 갖는 몬스터
  Pierrot: {
    name: "피에로",
    type: ["암석", "나무"],
    maxHp: 300,
    atk: 30,
    matk: 30,
    def: 20,
    mdef: 20,
    skills: [
      "SKILL_Slapstick_Comdey_P",
      "SKILL_Get_a_Present_P",
      "GIMMICK_Tears_of",
    ],
    gimmicks: [],
  },

  Clown: {
    name: "클라운",
    type: ["암석", "나무"],
    maxHp: 300,
    atk: 30,
    matk: 30,
    def: 20,
    mdef: 20,
    skills: [
      "SKILL_Slapstick_Comdey_C",
      "SKILL_Get_a_Present_C",
      "GIMMICK_Laugh_of",
    ],
    gimmicks: [],
  },
};

const MAP_CONFIGS = {
  "A-1": {
    name: "A-1: 황폐한 대지",
    width: 5,
    height: 5,
    enemies: [{ templateId: "Terrmor_1", pos: { x: 2, y: 2 } }],
    flavorText:
      "거대한 바위가 자연의 중심처럼 눌러앉아 있다.\n" +
      "그것은 그저 풍경처럼 존재하나, 땅이 울리고, 균열이 일어나면, 바위의 틈 사이로 희미한 숨결이 들려온다. 대지는 이미 깨어나고 있다.\n" +
      '"그 누가 잠든 대지를 일깨우느냐."',
  },

  "A-2": {
    name: "A-2. 생명의 터전",
    width: 5,
    height: 5,
    flavorText:
      '대지에 박혀 있던 바위에 서서히 금이 가기 시작한다.\n갈라진 틈에서 가느다란 뿌리들이 자라나고, 단단한 표면 위로 덩굴이 뒤엉키듯 솟아오른다.\n억눌러 왔던 생명이, 대지의 껍질을 완전히 벗겨낸 생명의 형상이,\n바위 위에서 기어코 개화한다.\n"대지 위에서 피어나는 것들은 모두 고통스러울 것이니."',
    deathScript:
      '테르모르의 팔이 천천히 꺾이며 내려앉는다.\n몸을 덮고 있던 꽃잎이 시들며 무너지고, 마지막 하나가 바람 없이 떨어진다.\n대지에는 더 이상 살아 있는 기척조차 남지 않았으며,\n조용히 무너진 몸 아래, 메마른 뿌리만이 그 자리에 남는다.\n"봄은, 다시 움트지 않으리라."',
    enemies: [{ templateId: "Terrmor_2", pos: { x: 2, y: 2 } }],
  },

  "B-1": {
    name: "B-1: 인형극장",
    width: 9,
    height: 9,
    enemies: [
      { templateId: "Carnabloom_1", pos: { x: 4, y: 4 } },
      { templateId: "Clown", pos: { x: 1, y: 1 } },
      { templateId: "Clown", pos: { x: 7, y: 7 } },
      { templateId: "Pierrot", pos: { x: 7, y: 1 } },
      { templateId: "Pierrot", pos: { x: 1, y: 7 } },
    ],
    flavorText:
      "텅 비어 있는 무대임에도 웃음소리와 울음소리로 소란스럽다.\n" +
      "붉은 천막이 열리고, 끈에 묶인 인형들이 삐걱이며 걸어나온다.\n" +
      "뒤틀린 미소, 휘청이는 몸짓, 반짝이는 리본.\n" +
      "그리고 무대 위 가장 높은 자리, 빛이 닿지 않는 어둠 속, 인형사가 존재를 드러낸다.\n" +
      '"부디 즐겨 주겠니. 세상에서 가장 사랑스러운 아이들이야."',
  },

  "B-2": {
    name: "B-2: 달의 그네",
    width: 9,
    height: 9,
    enemies: [
      { templateId: "Carnabloom_2", pos: { x: 4, y: 4 } },
      { templateId: "Clown", pos: { x: 1, y: 1 } },
      { templateId: "Clown", pos: { x: 7, y: 7 } },
      { templateId: "Pierrot", pos: { x: 7, y: 1 } },
      { templateId: "Pierrot", pos: { x: 1, y: 7 } },
    ],
    flavorText:
      "퍼레이드의 흐름이 끊긴다.\n" +
      "인형사는 움직임을 멈춘 인형들을 조용히 감싸 안는다.\n" +
      "사랑하던 이들의 몸이 따스하지 않은 품으로 삼켜질 때,\n" +
      "무대는 암전된다.\n" +
      '"끝까지 나를 실망시키는구나……. 그래도 마지막 장면에는 함께해야겠지."\n' +
      "어둠을 뚫고, 초승달의 형상을 지닌 공중 그네가 천천히 내려온다.\n" +
      "이곳에 발을 들이면 돌아갈 수 없으리라. \n",
    deathScript:
      '초승달 그네가 맥 없이 흔들린다.\n느리게, 아주 느리게, 그리고 서서히 움직임을 멈춘다.\n붉은 조명 아래 천장이 무너져 내리자,\n리본 하나가 공중을 가르며 천천히 바닥에 내려앉는다.\n무대 위의 모든 것은 조명 밖으로 사라지고, 곧 조용한 음악마저 사그라든다.\n"오늘 밤의 극은, 여기까지구나."', // 보스를 쓰러뜨렸을 때 나오는 멋진 스크립트!
  },
};

const GIMMICK_DATA = {
  GIMMICK_Aegis_of_Earth1: {
    name: "대지의 수호(동)",
    coords: "3,1;3,2;3,3;4,0;4,1;4,2;4,3;4,4",
    flavorText:
      '<pre>우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 동쪽 성벽 또한 작은 균열 하나에 허물어지는 법.\n"무딘 칼날로 대지를 가를 수 있겠는가?"</pre>\n',
    execute: (caster, allies, enemies, battleLog) => {
      caster.activeGimmick = "GIMMICK_Aegis_of_Earth1"; // 기믹 활성화
      battleLog(
        `✦기믹 발동✦ ${caster.name}이 [대지의 수호(동)] 태세를 갖춥니다. 동쪽 구역(파란색)이 안전지대가 됩니다.`
      );
      return true;
    },
  },
  GIMMICK_Aegis_of_Earth2: {
    name: "대지의 수호(서)",
    coords: "0,0;0,1;0,2;0,3;0,4;1,1;1,2;1,3",
    flavorText:
      '<pre>우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 서쪽 성벽 또한 작은 균열 하나에 허물어지는 법.\n"무딘 칼날로 대지를 가를 수 있겠는가?"</pre>\n',
    execute: (caster, allies, enemies, battleLog) => {
      caster.activeGimmick = "GIMMICK_Aegis_of_Earth2"; // 기믹 활성화
      battleLog(
        `✦기믹 발동✦ ${caster.name}이 [대지의 수호(서)] 태세를 갖춥니다. 서쪽 구역(파란색)이 안전지대가 됩니다.`
      );
      return true;
    },
  },
  GIMMICK_Aegis_of_Earth3: {
    name: "대지의 수호(남)",
    coords: "1,3;2,3;3,3;0,4;1,4;2,4;3,4;4,4",
    flavorText:
      '<pre>우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 남쪽 성벽 또한 작은 균열 하나에 허물어지는 법.\n"무딘 칼날로 대지를 가를 수 있겠는가?"</pre>\n',
    execute: (caster, allies, enemies, battleLog) => {
      caster.activeGimmick = "GIMMICK_Aegis_of_Earth3"; // 기믹 활성화
      battleLog(
        `✦기믹 발동✦ ${caster.name}이 [대지의 수호(남)] 태세를 갖춥니다. 남쪽 구역(파란색)이 안전지대가 됩니다.`
      );
      return true;
    },
  },

  GIMMICK_Aegis_of_Earth4: {
    name: "대지의 수호(북)",
    coords: "0,0;1,0;2,0;3,0;4,0;1,1;2,1;3,1",
    flavorText:
      '<pre>우리가 상대할 것은 대지, 그 자체였을까.\n절벽이 앞을 가로막는다.\n허나 무너뜨릴 수 없을 듯하던 북쪽 성벽 또한 작은 균열 하나에 허물어지는 법.\n"무딘 칼날로 대지를 가를 수 있겠는가?"</pre>\n',
    execute: (caster, allies, enemies, battleLog) => {
      caster.activeGimmick = "GIMMICK_Aegis_of_Earth4"; // 기믹 활성화
      battleLog(
        `✦기믹 발동✦ ${caster.name}이 [대지의 수호(북)] 태세를 갖춥니다. 북쪽 구역(파란색)이 안전지대가 됩니다.`
      );
      return true;
    },
  },

  GIMMICK_Path_of_Ruin: {
    name: "균열의 길",
    description:
      "무작위 행과 열에 공격을 예고합니다. 1턴 뒤 예고된 타일에 피해를 줍니다. 해당 타일에 아군이 없으면 파훼 성공.",
    success: "보스에게 [붕괴] 디버프(방어력/마법 방어력 30% 감소, 2턴) 부여.",
    failure:
      "범위 내 아군에게 (마법 공격력) 피해 및 [무장 해제](공격 스킬 사용 불가, 1턴) 부여.",
    script:
      '<pre>\n균열이 퍼지며, 땅 아래서 검은 뿌리가 꿈틀댄다.\n번져오는 재해 앞에서 길을 찾아야 한다.\n"생명의 뿌리를 꺾을 수 있다고 믿는가?"\n</pre>',
    execute: (caster, allies, enemies, battleLog, dynamicData) => {
      caster.addBuff(
        "path_of_ruin_telegraph",
        "균열의 길 예고",
        2,
        dynamicData
      );
      battleLog(
        `✦기믹 발동✦ ${caster.name}이 [균열의 길]을 생성합니다. 1턴 뒤 예고된 타일에 피해를 줍니다.`
      );
      return true;
    },
  },

  GIMMICK_Seed_of_Devour: {
    name: "흡수의 술식",
    coords: "1,1;1,2;1,3;2,1;2,3;3,1;3,2;3,3",
    description: "세 가지 형태의 기믹 중 하나가 무작위로 발동합니다.",
    subGimmick1: {
      name: "열매 파괴",
      script:
        '생명의 씨앗들이 고개를 들기 시작한다.\n이 씨앗들이 결실을 맺지 못하도록 꺾어야 한다.\n"씨앗은 생명을 흡수해, 다시 죽음을 틔운다."',
      description: "맵에 2개의 열매가 생성됩니다. 3턴 내에 모두 파괴하세요.",
    },
    subGimmick2: {
      name: "불안정한 균열",
      script:
        '생명의 씨앗들이 뿌리를 내리기 시작한다.\n단단하게 내린 뿌리가 우리를 옭아맬 것이다.\n"뿌리는 뽑아도 뽑히지 않고, 다시 죽음을 틔운다."',
      description:
        "맵에 3개의 [불안정한 균열] 지대가 생성됩니다. 3턴 뒤 폭발하며, 아군이 위에 서서 폭발을 막아야 합니다.",
    },
    subGimmick3: {
      name: "메마른 생명의 샘",
      script:
        '생명의 씨앗들이 메마른 땅에서 목을 축인다.\n굶주린 씨앗들은 분노할 것이다.\n"마른 땅에서도 씨앗은 움트니, 비로소 생명이 된다."',
      description:
        "맵에 '메마른 생명의 샘'이 생성됩니다. 3턴 내에 50 이상의 생명력을 회복시키세요.",
    },
  },
};

const SPAWN_POINTS = {
  Clown: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 2 },
    { x: 4, y: 2 },
  ],
  Pierrot: [
    { x: 2, y: 0 },
    { x: 0, y: 4 },
    { x: 2, y: 4 },
    { x: 4, y: 4 },
  ],
};

function renderMapGrid(
  mapContainerElement,
  allyChars,
  enemyChars,
  mapObjs = [],
  activeAreaEffects = [],
  previewedHitArea = [],
  previewedSkillId = null,
  width = 5,
  height = 5
) {
  if (!mapContainerElement) return;
  mapContainerElement.innerHTML = "";

  const previewCoordSet = new Set(previewedHitArea.map((p) => `${p.x},${p.y}`));
  const clownSpawns = new Set(SPAWN_POINTS.Clown.map((p) => `${p.x},${p.y}`));
  const pierrotSpawns = new Set(
    SPAWN_POINTS.Pierrot.map((p) => `${p.x},${p.y}`)
  );

  const gridContentMap = {};
  [...allyChars, ...enemyChars].forEach((char) => {
    if (char.isAlive && char.posX !== -1 && char.posY !== -1) {
      const key = `${char.posX},${char.posY}`;
      if (!gridContentMap[key]) gridContentMap[key] = [];
      const nameInitial =
        char.name.length > 1
          ? char.name.substring(0, 2)
          : char.name.substring(0, 1);
      gridContentMap[key].push({
        type: "character",
        initial: nameInitial,
        team: allyChars.includes(char) ? "ally" : "enemy",
      });
    }
  });

  mapObjs.forEach((obj) => {
    const key = `${obj.posX},${obj.posY}`;
    if (!gridContentMap[key]) gridContentMap[key] = [];
    gridContentMap[key].push({
      type: "gimmick",
      gimmickType: obj.type,
      obj: obj,
    });
  });

  for (let y = 0; y < height; y++)
  const rowDiv = document.createElement("div");
  rowDiv.className = "map-row";
  for (let x = 0; x < width; x++) {
      const cellDiv = document.createElement("div");
      cellDiv.className = "map-cell";
      const key = `${x},${y}`;

      if (clownSpawns.has(key)) cellDiv.classList.add("clown-spawn");
      if (pierrotSpawns.has(key)) cellDiv.classList.add("pierrot-spawn");

      // 안전지대 판정
      if (previewCoordSet.has(key)) {
        if (
          previewedSkillId &&
          (previewedSkillId === "GIMMICK_Script_Reversal" ||
            previewedSkillId.startsWith("GIMMICK_Aegis_of_Earth"))
        ) {
          cellDiv.classList.add("safe-zone"); // 파란색 표시
        } else {
          cellDiv.classList.add("skill-preview-zone"); // 주황색 표시
        }
      }

      if (gridContentMap[key]) {
        const gimmickContent = gridContentMap[key].find(
          (c) => c.type === "gimmick" && c.obj
        );
        if (gimmickContent) {
          cellDiv.onclick = () => {
            if (typeof selectTarget === "function") {
              selectTarget(gimmickContent.obj.id);
            }
          };
        }

        gridContentMap[key].forEach((c) => {
          const marker = document.createElement("div");
          if (c.type === "character") {
            marker.className = `char-marker ${c.team}`;
            marker.textContent = c.initial;
          } else if (c.type === "gimmick") {
            marker.className = `gimmick-object gimmick-${c.gimmickType}`;
            if (c.gimmickType === "fruit") marker.textContent = "🌱";
            if (c.gimmickType === "fissure") marker.textContent = "💥";
            if (c.gimmickType === "spring") {
              marker.textContent = "⛲️";
            }
          }
          cellDiv.appendChild(marker);
        });
      }
      rowDiv.appendChild(cellDiv);
    }
    mapContainerElement.appendChild(rowDiv);
  }
}
