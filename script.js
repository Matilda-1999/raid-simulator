import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAOd24AzDmA609KAaa_4frTMnAeY8mJrXM",
  authDomain: "raid-simulator-1999.firebaseapp.com",
  databaseURL: "https://raid-simulator-1999-default-rtdb.firebaseio.com",
  projectId: "raid-simulator-1999",
  storageBucket: "raid-simulator-1999.firebasestorage.app",
  messagingSenderId: "112905026016",
  appId: "1:112905026016:web:419f84388bae3e6291d385",
  measurementId: "G-P176XFZWH2",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- 0. 상수 정의 ---
let MAP_WIDTH = 5;
let MAP_HEIGHT = 5;
let enemyPreviewAction = null; // 몬스터가 예고한 행동 정보 저장

const TYPE_ADVANTAGE_MODIFIER = 1.3; // 상성일 때 피해량 30% 증가
const TYPE_DISADVANTAGE_MODIFIER = 0.7; // 역상성일 때 피해량 30% 감소
const TYPE_RELATIONSHIPS = {
  야수: "나무",
  나무: "천체",
  천체: "암석",
  암석: "야수",
};

const SKILLS = {
  // [근성]
  SKILL_RESILIENCE: {
    id: "SKILL_RESILIENCE",
    name: "근성",
    type: "어그로",
    description:
      "원래 연극은 대사를 고르게 나누지 않는다. … 잠깐. 또 너야?<br><br>홀수 턴에는 [철옹성]을, 짝수 턴에는 [의지]를 획득. <br><br>[철옹성]: (자신에게 현재 체력의 2배 + 방어력 2배)만큼의 보호막 부여. 해당 턴에 발생한 모든 아군의 감소한 체력을 대신 감소. 3턴 유지. <br>[의지]: 자신에게 (해당 전투에서 시전 턴까지 받은 대미지의 총 합 * 2.5배)만큼의 보호막을 부여. 이후 [의지] 버프가 해제될 때에 남아 있는 보호막만큼을 자신의 체력으로 흡수. 3턴 유지. 단, [의지] 버프가 해제되면 그동안 받은 대미지의 총합을 초기화.",
    targetType: "self",
    targetSelection: "self",
    execute: (caster, allies, enemies, battleLog) => {
      if (currentTurn % 2 === 1) {
        // 홀수 턴: 철옹성
        const shieldAmount = Math.round(
          caster.currentHp * 2.0 + caster.def * 2.0
        );
        caster.removeBuffById("iron_fortress");
        caster.addBuff("iron_fortress", "[철옹성]", 3, {
          description: "자신에게 보호막 부여. 3턴간 아군 피해 대신 받음.",
          shieldAmount: shieldAmount,
          redirectAllyDamage: true,
        });
        battleLog(
          `✦스킬✦ ${
            caster.name
          }, [근성](홀수) 사용: [철옹성] 효과 발동. 보호막 +${shieldAmount} (3턴). (현재 총 보호막: ${caster.shield.toFixed(
            0
          )})`
        );
      } else {
        // 짝수 턴: 의지
        const damageTaken = caster.totalDamageTakenThisBattle;
        const shieldAmount = Math.round(damageTaken * 2.5);
        caster.removeBuffById("will_buff");
        caster.addBuff("will_buff", "[의지]", 3, {
          description:
            "받은 총 피해 비례 보호막. 해제 시 남은 보호막만큼 체력 흡수 및 받은 피해 총합 초기화.",
          shieldAmount: shieldAmount,
          healOnRemove: true,
          resetsTotalDamageTaken: true,
        });
        battleLog(
          `✦스킬✦ ${
            caster.name
          }, [근성](짝수) 사용: [의지] 효과 발동. (받은 피해: ${damageTaken}) 보호막 +${shieldAmount} (3턴). (현재 총 보호막: ${caster.shield.toFixed(
            0
          )})`
        );
      }
      return true;
    },
  },

  // [반격]
  SKILL_COUNTER: {
    id: "SKILL_COUNTER",
    name: "반격",
    type: "카운터",
    description:
      "출연 기회는 모두에게 주어진다. 관객 없는 무대는 놀랍도록 관대하니까.<br><br>쿨타임 1턴. [반격]이 홀수 턴에는 [응수], 짝수 턴에는 [격노]로 발동. <br><br>[응수]: 해당 보호막 최대 2턴 유지. 자신이 지닌 보호막을 모든 아군에게 균등하게 나눔. 해당 턴에 자신이 공격받는다면, 가장 체력이 높은 적군(단일)에게 (받는 피해)x1.5 피해. 아군이 공격받는다면, 가장 체력이 낮은 적군(단일)에게 (받는 피해)x.0.5 피해. 만약 적군의 체력이 동일하다면, 대상 중 랜덤 피해. <br>[격노]: 해당 보호막 최대 2턴 유지. 자신이 지닌 보호막을 모든 아군에게 균등하게 나눔. 해당 턴에 자신이 공격받는다면, 모든 적군에게 (받는 피해)x1.5 피해. 아군이 공격받는다면, 모든 적군에게 (받는 피해)x0.5 피해.",
    targetType: "self",
    targetSelection: "self",
    cooldown: 2, // 사용 후 1턴간 사용 불가 (2턴째부터 사용 가능)
    execute: (caster, allies, enemies, battleLog) => {
      const skillName = SKILLS.SKILL_COUNTER.name;

      const lastUsed = caster.lastSkillTurn[SKILLS.SKILL_COUNTER.id] || 0;
      if (
        lastUsed !== 0 &&
        currentTurn - lastUsed < SKILLS.SKILL_COUNTER.cooldown
      ) {
        battleLog(
          `✦정보✦ ${caster.name}, [${skillName}] 사용 불가: 쿨타임 ${
            SKILLS.SKILL_COUNTER.cooldown - (currentTurn - lastUsed)
          }턴 남음.`
        );
        return false;
      }

      const baseShieldAmountFromCaster = caster.shield;

      if (baseShieldAmountFromCaster > 0) {
        const allLivingAlliesIncludingCaster = allies.filter((a) => a.isAlive);
        if (allLivingAlliesIncludingCaster.length > 0) {
          const shieldPerAlly = Math.round(
            baseShieldAmountFromCaster / allLivingAlliesIncludingCaster.length
          );
          battleLog(
            `✦효과✦ ${caster.name}, [${skillName}]의 보호막 분배: 자신의 보호막(${baseShieldAmountFromCaster}) 기반으로 아군 ${allLivingAlliesIncludingCaster.length}명에게 2턴 보호막 버프 부여.`
          );
          allLivingAlliesIncludingCaster.forEach((ally) => {
            const buffId = `counter_shield_${caster.id}_to_${ally.id}_${currentTurn}`;
            ally.addBuff(buffId, "[반격 보호막]", 2, {
              shieldAmount: shieldPerAlly,
            });
          });
          caster.shield = 0;
        } else {
          battleLog(
            `✦정보✦ ${caster.name}, [${skillName}] 보호막 분배: 대상 아군 없음.`
          );
        }
      } else {
        battleLog(
          `✦정보✦ ${caster.name}, [${skillName}] 보호막 분배: 나눌 보호막 없음.`
        );
      }

      if (currentTurn % 2 === 1) {
        // 홀수 턴: 응수
        caster.removeBuffById("riposte_stance");
        caster.removeBuffById("fury_stance");
        caster.addBuff("riposte_stance", "[응수]", 1, {
          description:
            "자신 피격 시 가장 체력 높은 적 단일 반격(1.5배), 아군 피격 시 가장 체력 낮은 적 단일 반격(0.5배).",
        });
        battleLog(
          `✦스킬✦ ${caster.name}, [반격](홀수) 사용: [응수] 태세 돌입. (1턴)`
        );
      } else {
        // 짝수 턴: 격노
        caster.removeBuffById("fury_stance");
        caster.removeBuffById("riposte_stance");
        caster.addBuff("fury_stance", "[격노]", 2, {
          description:
            "자신 피격 시 모든 적 반격(1.5배), 아군 피격 시 모든 적 반격(0.5배).",
        });
        battleLog(
          `✦스킬✦ ${caster.name}, [반격](짝수) 사용: [격노] 태세 돌입. (2턴)`
        );
      }
      caster.lastSkillTurn[SKILLS.SKILL_COUNTER.id] = currentTurn;
      return true;
    },
  },
  // [도발]
  SKILL_PROVOKE: {
    id: "SKILL_PROVOKE",
    name: "도발",
    type: "어그로",
    description:
      "주인공이 여기에 있다. 자, 이제 대사를 날리자. 관객들이 지루해하기 전에.<br><br>해당 턴에 자신의 받는 피해 0.3으로 감소. 다음 적군 턴 동안 모든 적군은 자신만을 대상으로 공격. 해당 턴에 자신의 감소한 체력 총합 저장.",
    targetType: "self",
    targetSelection: "self",
    execute: (caster, allies, enemies, battleLog) => {
      caster.addBuff("provoke_damage_reduction", "피해 감소 (도발)", 1, {
        damageReduction: 0.7,
      });
      enemies
        .filter((e) => e.isAlive)
        .forEach((enemy) => {
          enemy.addDebuff("provoked", "도발 (타겟 고정)", 2, {
            targetId: caster.id,
          });
        });
      caster.aggroDamageStored = 0;
      battleLog(
        `✦효과✦ ${caster.name}, [도발] 사용: 모든 적을 도발합니다. 자신은 받는 피해가 감소합니다.`
      );
      return true;
    },
  },

  // [역습]
  SKILL_REVERSAL: {
    id: "SKILL_REVERSAL",
    name: "역습",
    type: "카운터",
    description:
      "타이밍은 대사가 아니다. 하지만 좋은 대사는 늘 제때에 맞는다.<br><br>자신의 현재 체력 0.5로 감소. <br>해당 턴에 자신이 공격받은 후, 홀수 턴에는 (공격력 + [도발] 저장 피해)x1.5 물리 피해. <br>짝수 턴에는 (마법 공격력 + [도발] 저장 피해)x1.5 마법 피해를 공격한 적군에게 줌. <br>반격 후, 도발 저장량 초기화. (쿨타임 1턴)",
    targetType: "self",
    targetSelection: "self",
    cooldown: 2, // 사용 후 1턴간 사용 불가
    execute: (caster, allies, enemies, battleLog) => {
      const lastUsed = caster.lastSkillTurn[SKILLS.SKILL_REVERSAL.id] || 0;
      if (
        lastUsed !== 0 &&
        currentTurn - lastUsed < SKILLS.SKILL_REVERSAL.cooldown
      ) {
        battleLog(
          `✦정보✦ ${caster.name}, [역습] 사용 불가: 쿨타임 ${
            SKILLS.SKILL_REVERSAL.cooldown - (currentTurn - lastUsed)
          }턴 남음.`
        );
        return false;
      }

      const hpLoss = Math.round(caster.currentHp * 0.5);
      caster.currentHp -= hpLoss;
      if (caster.currentHp < 1) caster.currentHp = 1;
      battleLog(
        `✦소모✦ ${
          caster.name
        }, [역습] 사용 준비: 체력 ${hpLoss} 소모. (현재 HP: ${caster.currentHp.toFixed(
          0
        )})`
      );
      caster.addBuff("reversal_active", "역습 대기", 1, {});
      caster.lastSkillTurn[SKILLS.SKILL_REVERSAL.id] = currentTurn;
      return true;
    },
  },

  // [허상]
  SKILL_ILLUSION: {
    id: "SKILL_ILLUSION",
    name: "허상",
    type: "지정 버프",
    description:
      "무엇을 찾으려 했는가. 애초에 목적을 알고 있었는가?<br><br>1. 단일 강화, 자신에게 사용 시 (공격)x0.5만큼 체력 회복.<br>2. 다른 아군에게 사용 시 자신의 (공격)x0.2만큼 체력을 잃고 아군의 (공격)x2.0 증가. 단, 받은 피해가 짝수일 시 마법 공격력, 홀수일 시 공격력 증가. 첫 턴에는 사용 불가능. 2 턴 지속.<br>3. 턴 종료 시 목표 적군에게 (공격)x0.5 추가 공격 개시.",
    targetType: "single_ally_or_self",
    targetSelection: "ally_or_self",
    execute: (caster, target, allies, enemies, battleLog) => {
      console.log(
        `[DEBUG] 허상 스킬 실행: 시전자(${caster.name}), 대상(${target?.name}), 현재 턴(${currentTurn})`
      );

      if (!target) {
        battleLog(
          `✦정보✦ ${caster.name} [허상]: 스킬 대상을 찾을 수 없습니다.`
        );
        return false;
      }

      // 2번 조건: 첫 턴에 다른 아군에게 사용 불가
      if (caster.id !== target.id && currentTurn <= 1) {
        battleLog(
          `✦정보✦ ${caster.name} [허상]: 첫 턴에는 다른 아군에게 사용할 수 없습니다.`
        );
        console.log(
          `[DEBUG] 허상: 첫 턴(${currentTurn})에 아군 대상 지정으로 사용 불가.`
        );
        return false;
      }

      if (caster.id === target.id) {
        // 자신에게 사용
        let healAmount = Math.round(caster.getEffectiveStat("atk") * 0.5);
        applyHeal(caster, healAmount, battleLog, "허상");
      } else {
        // 다른 아군에게 사용
        const hpLoss = Math.round(caster.getEffectiveStat("atk") * 0.2);
        caster.currentHp -= hpLoss;
        if (caster.currentHp < 1) caster.currentHp = 1;
        battleLog(
          `✦소모✦ ${caster.name}, [허상] 사용 (${
            target.name
          } 대상): 체력 ${hpLoss} 소모. (HP: ${caster.currentHp.toFixed(0)})`
        );

        // 받은 피해 총합의 홀짝에 따라 버프 종류 결정
        const totalDamageTaken = caster.totalDamageTakenThisBattle;
        console.log(
          `[DEBUG] 허상: 시전자의 받은 피해 총합(${totalDamageTaken})`
        );
        if (totalDamageTaken % 2 === 0) {
          // 짝수: 마법 공격력 증가
          target.addBuff("illusion_matk_boost", "마법 공격력 증가 (허상)", 2, {
            type: "matk_boost_multiplier",
            value: 2.0,
          });
          battleLog(
            `✦버프✦ ${target.name}: [허상 효과] 마법 공격력 2배 증가 (2턴).`
          );
        } else {
          // 홀수: 공격력 증가
          target.addBuff("illusion_atk_boost", "공격력 증가 (허상)", 2, {
            type: "atk_boost_multiplier",
            value: 2.0,
          });
          battleLog(
            `✦버프✦ ${target.name}: [허상 효과] 공격력 2배 증가 (2턴).`
          );
        }
      }

      // 3번 조건: 턴 종료 추가 공격
      const firstAliveEnemy = enemies.find((e) => e.isAlive);
      if (firstAliveEnemy) {
        caster.addBuff(
          "illusion_end_turn_attack",
          "턴 종료 추가 공격 (허상)",
          1,
          {
            attackerId: caster.id,
            originalTargetId: target.id,
            enemyTargetId: firstAliveEnemy.id,
            power: 0.5,
            damageType: "physical",
          }
        );
      } else {
        battleLog(
          `✦정보✦ ${caster.name} [허상]: 턴 종료 추가 공격 대상을 찾을 수 없습니다.`
        );
      }

      // 서포터 직군 효과
      caster.checkSupporterPassive(battleLog);
      return true;
    },
  },

  // [허무]
  SKILL_NIHILITY: {
    id: "SKILL_NIHILITY",
    name: "허무",
    type: "지정 버프",
    description:
      "실재하지 않는 이상에 도달하려 한 자의 잔상이다.<br><br>단일 강화. 목표 아군의 [상태 이상], [제어], [속성 감소] 랜덤 2개 정화. [버프 집합] 중 랜덤 1개 부여(2턴).",
    targetType: "single_ally",
    targetSelection: "ally",
    execute: (caster, target, allies, enemies, battleLog) => {
      if (!target) {
        battleLog(
          `✦정보✦ ${caster.name} [허무]: 스킬 대상을 찾을 수 없습니다.`
        );
        return false;
      }
      battleLog(
        `✦스킬✦ ${caster.name}, ${target.name}에게 [허무] 사용: 디버프 정화 및 랜덤 버프 부여.`
      );

      const removableDebuffs = target.debuffs.filter((d) =>
        ["상태 이상", "제어", "속성 감소"].includes(d.effect.category || "기타")
      );
      let removedCount = 0;
      for (let i = removableDebuffs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [removableDebuffs[i], removableDebuffs[j]] = [
          removableDebuffs[j],
          removableDebuffs[i],
        ];
      }
      for (let i = 0; i < Math.min(2, removableDebuffs.length); i++) {
        const debuffToRemove = removableDebuffs[i];
        target.removeDebuffById(debuffToRemove.id);
        battleLog(
          `✦정화✦ ${target.name}: [${debuffToRemove.name}] 디버프 정화됨.`
        );
        removedCount++;
      }
      if (removedCount === 0 && removableDebuffs.length > 0) {
        battleLog(
          `✦정보✦ ${target.name}: 정화할 수 있는 디버프가 없습니다(선택실패).`
        );
      } else if (removableDebuffs.length === 0) {
        battleLog(`✦정보✦ ${target.name}: 정화할 수 있는 디버프가 없습니다.`);
      }

      const buffChoices = [
        {
          id: "nihility_heal_hot",
          name: "턴 시작 시 HP 회복 (허무)",
          turns: 2,
          effect: {
            type: "turn_start_heal",
            value: Math.round(caster.getEffectiveStat("atk") * 0.5),
          },
        },
        {
          id: "nihility_reflect_dmg",
          name: "피해 반사 (허무)",
          turns: 2,
          effect: { type: "damage_reflect", value: 0.3 },
        },
        {
          id: "nihility_def_boost",
          name: "방어력 증가 (허무)",
          turns: 2,
          effect: { type: "def_boost_multiplier", value: 1.3 },
        },
        {
          id: "nihility_atk_boost",
          name: "공격력 증가 (허무)",
          turns: 2,
          effect: { type: "atk_boost_multiplier", value: 1.5 },
        },
      ];
      const chosenBuffData =
        buffChoices[Math.floor(Math.random() * buffChoices.length)];
      target.addBuff(
        chosenBuffData.id,
        chosenBuffData.name,
        chosenBuffData.turns,
        chosenBuffData.effect
      );
      battleLog(
        `✦버프✦ ${target.name}: [허무] 효과로 [${chosenBuffData.name}] 획득(2턴).`
      );

      // 서포터 직군 효과
      caster.checkSupporterPassive(battleLog);
      return true;
    },
  },

// [실존]
    SKILL_REALITY: {
        id: "SKILL_REALITY",
        name: "실존",
        type: "광역 버프",
        description: "보아라, 눈앞에 놓여진 것을. 그리고 말하라, 당신이 깨달은 것을.<br><br>모든 아군 방어력 x0.3 증가 (2턴). <br>자신은 [실재] 4스택 추가 획득 (2턴, 해제 불가). <br>연속 사용 시 추가 2스택 획득. 3회 연속 사용 불가. <br>[실재]: 모든 아군의 (방어력/마방 중 높은 수치)x20% 증가.",
        targetType: "all_allies",
        targetSelection: "all_allies",
        cooldown: 0, // 연속 사용을 허용하기 위해 기본 쿨타임은 0으로 설정 (내부 로직으로 제한)
        execute: (caster, allies, enemies, battleLog) => {
            const currentTurnNum = currentTurn;
            const realityBuff = caster.buffs.find((b) => b.id === "reality_stacks");
            
            // 1. 연속 사용 카운트 체크 (3턴 연속 사용 방지)
            const consecutiveCount = realityBuff ? (realityBuff.consecutiveCount || 0) : 0;
            if (consecutiveCount >= 2 && realityBuff.lastAppliedTurn === currentTurnNum - 1) {
                battleLog(`✦정보✦ ${caster.name}: [실존]을 3턴 연속 사용할 수 없습니다.`);
                return false;
            }

            battleLog(`✦스킬✦ ${caster.name}, [실존] 사용: 모든 아군 방어력 증가 및 자신에게 [실재] 부여.`);

            // 2. 모든 아군 방어력 30% 증가
            allies.filter((a) => a.isAlive).forEach((ally) => {
                ally.addBuff("reality_def_boost", "방어력 증가 (실존)", 2, {
                    type: "def_boost_multiplier",
                    value: 1.3,
                });
            });
            battleLog(`✦버프✦ 모든 아군: 방어력 30% 증가(2턴).`);

            // 3. [실재] 스택 및 수치 계산
            let realityStacksToAdd = 4;
            let newConsecutiveCount = 1;

            if (realityBuff && realityBuff.lastAppliedTurn === currentTurnNum - 1) {
                realityStacksToAdd = 6; // 연속 사용 시 6스택으로 갱신
                newConsecutiveCount = consecutiveCount + 1;
                battleLog(`✦효과✦ ${caster.name} [실존] 연속 사용: [실재] 6스택 획득.`);
            }

            // [기획 반영] 모든 아군의 (방어력 vs 마방 중 높은 수치) 합산의 20% 계산
            let totalAllyStatValue = 0;
            allies.filter(a => a.isAlive).forEach(ally => {
                const highStat = Math.max(ally.getEffectiveStat('def'), ally.getEffectiveStat('mdef'));
                totalAllyStatValue += highStat;
            });
            const boostValuePerStack = totalAllyStatValue * 0.2; // 스택당 증가량 (합산의 20%)

            // 4. 시전자 자신에게 [실재] 버프 부여 (갱신 방식)
            caster.addBuff(
                "reality_stacks",
                "[실재]",
                2,
                {
                    // getEffectiveStat에서 참조할 값들
                    type: "reality_boost", 
                    stacks: realityStacksToAdd,
                    boostValuePerStack: boostValuePerStack, // 계산된 20% 수치 저장
                    unremovable: true,
                    lastAppliedTurn: currentTurnNum,
                    consecutiveCount: newConsecutiveCount // 연속 사용 횟수 저장
                },
                true // 기존 버프 제거 후 새로 추가 (갱신)
            );

            battleLog(`✦버프✦ ${caster.name}: [실재] ${realityStacksToAdd}스택 적용 (스택당 +${boostValuePerStack.toFixed(0)}, 2턴, 해제 불가).`);

            caster.lastSkillTurn[SKILLS.SKILL_REALITY.id] = currentTurnNum;
            caster.checkSupporterPassive(battleLog);
            return true;
        },
    },

  // [진리]
  SKILL_TRUTH: {
    id: "SKILL_TRUTH",
    name: "진리",
    type: "광역 디버프",
    description:
      "아래는 진창이었음을. 드디어 깨달은 당신에게 선사하는 아름다운 정론이다.<br><br>1. 광역 디버프<br>2. 모든 적군에게 2턴 동안 [중독](턴 종료 시 대상의 현재 체력의 1.5% 만큼의 고정 피해) 상태 부여.<br>3. 중독 결산 후 랜덤 적군에게 [맹독](사용자의 공격)x0.3 추가 공격 부여.",
    targetType: "all_enemies",
    targetSelection: "all_enemies",
    execute: (caster, enemies, battleLog) => {
      battleLog(
        `✦스킬✦ ${caster.name}, [진리] 사용: 모든 적에게 [중독]을 부여합니다.`
      );

      // 맹독(추가 공격) 계산을 위한 시전자 공격력 미리 가져오기
      const attackStat = caster.getEffectiveStat("atk");

      enemies
        .filter((e) => e.isAlive)
        .forEach((enemy) => {
          // 대상의 '현재 체력'인 currentHp를 사용
          const poisonDamage = enemy.currentHp * 0.015;

          // [DEBUG] 로그
          console.log(
            `[DEBUG] 진리: 대상(${
              enemy.name
            }) 현재 HP: ${enemy.currentHp.toFixed(
              0
            )} / 계산된 중독 피해(1.5%): ${poisonDamage.toFixed(1)}`
          );

          enemy.addDebuff("poison_truth", "[중독](진리)", 2, {
            damagePerTurn: poisonDamage,
            type: "fixed",
            casterId: caster.id,
            category: "상태 이상",
          });
          battleLog(`✦상태 이상✦ ${enemy.name}, [중독](진리) 효과 적용(2턴).`);
        });

      // 턴 종료 후 [맹독] 공격을 위한 마커 추가
      caster.addBuff("truth_end_turn_attack_marker", "맹독 추가 공격 대기", 1, {
        originalCasterId: caster.id,
        power: 0.3,
      });
      return true;
    },
  },

  // [서막]
  SKILL_OVERTURE: {
    id: "SKILL_OVERTURE",
    name: "서막",
    type: "단일 공격",
    description:
      "막이 오르면, 파열이 시작된다. <br><br>공격력 200% 물리 피해/마법 공격력 250% 마법 피해를 가하고 상대에게 [흠집]을 새긴다. <br>[흠집]: 기본 2턴, 중첩 시 마지막 흠집 유지 시간에 따름. 3회까지 중첩. 추가 공격 이후 사라짐.",
    targetType: "single_enemy",
    targetSelection: "enemy",
    execute: (caster, target, allies, enemies, battleLog) => {
      if (!target) {
        battleLog(
          `✦정보✦ ${caster.name} [서막]: 스킬 대상을 찾을 수 없습니다.`
        );
        return false;
      }
      if (!target.isAlive) {
        battleLog(
          `✦정보✦ ${caster.name} [서막]: 대상 ${target.name}은(는) 이미 쓰러져 있습니다.`
        );
        return false;
      }

      const damageType =
        caster.getEffectiveStat("atk") >= caster.getEffectiveStat("matk")
          ? "physical"
          : "magical";
      const skillPower = damageType === "physical" ? 2.0 : 2.5;
      const damage = calculateDamage(caster, target, skillPower, damageType);
      target.takeDamage(damage, battleLog, caster);
      battleLog(
        `✦피해✦ ${caster.name}, [서막]: ${target.name}에게 ${damage} ${
          damageType === "physical" ? "물리" : "마법"
        } 피해.`
      );

      // 시전자의 '영감(타입)'에 따라 감소시킬 방어력 종류를 결정
      let defenseToReduce;
      if (caster.type === "암석" || caster.type === "야수") {
        defenseToReduce = "def"; // 물리 방어력
      } else if (caster.type === "천체" || caster.type === "나무") {
        defenseToReduce = "mdef"; // 마법 방어력
      } else {
        // '영감'이 지정되지 않은 경우, 더 높은 공격력 스탯을 기준으로 결정
        defenseToReduce = damageType === "physical" ? "def" : "mdef";
      }

      // 디버프에 어떤 방어력을 감소시킬지('reductionType'), 감소율은 얼마인지('reductionPerStack') 정보 추가
      target.addDebuff("scratch", "[흠집]", 2, {
        maxStacks: 3,
        overrideDuration: true,
        removerSkillId: SKILLS.SKILL_CLIMAX.id,
        category: "표식",
        reductionType: defenseToReduce, // 'def' 또는 'mdef' 저장
        reductionValue: 0.1, // 스택당 10% 감소
      });
      const scratchStacks = target.getDebuffStacks("scratch");
      const defenseTypeKorean =
        defenseToReduce === "def" ? "방어력" : "마법 방어력";
      battleLog(
        `✦디버프✦ ${target.name}, [흠집] 효과 적용 (${defenseTypeKorean} 감소). (현재 ${scratchStacks}스택).`
      );

      return true;
    },
  },

  // [절정]
  SKILL_CLIMAX: {
    id: "SKILL_CLIMAX",
    name: "절정",
    type: "단일 공격",
    description:
      "모든 장면은 이 순간을 위해 준비된다.<br><br>시전자의 타입에 따라 공격력 또는 마법 공격력의 270% 피해. 이후 상대에게 새겨진 [흠집] 수에 따라 각각 공격력/마법 공격력의 25%(1개)/35%(2개)/45%(3개) 추가 공격 2회. [흠집]은 추가 공격 후 소멸.",
    targetType: "single_enemy",
    targetSelection: "enemy",
    execute: (caster, target, allies, enemies, battleLog) => {
      if (!target) {
        battleLog(
          `✦정보✦ ${caster.name} [절정]: 스킬 대상을 찾을 수 없습니다.`
        );
        return false;
      }
      if (!target.isAlive) {
        battleLog(
          `✦정보✦ ${caster.name} [절정]: 대상(${target.name})이 이미 쓰러져 있습니다.`
        );
        return false;
      }

      let statTypeToUse;
      let damageType;

      if (caster.type === "암석" || caster.type === "야수") {
        statTypeToUse = "atk";
        damageType = "physical";
      } else if (caster.type === "천체" || caster.type === "나무") {
        statTypeToUse = "matk";
        damageType = "magical";
      } else {
        statTypeToUse =
          caster.getEffectiveStat("atk") >= caster.getEffectiveStat("matk")
            ? "atk"
            : "matk";
        damageType = statTypeToUse === "atk" ? "physical" : "magical";
      }
      const damageTypeKorean = damageType === "physical" ? "물리" : "마법";

      const mainSkillPower = 2.7;
      battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [절정] 공격.`);
      const mainDamage = calculateDamage(
        caster,
        target,
        mainSkillPower,
        damageType,
        statTypeToUse
      );
      target.takeDamage(mainDamage, battleLog, caster);
      battleLog(
        `  ✦피해✦ [절정]: ${target.name}에게 ${mainDamage} ${damageTypeKorean} 피해.`
      );

      if (!target.isAlive) return true;

      const scratchStacks = target.getDebuffStacks("scratch");
      if (scratchStacks > 0) {
        battleLog(
          `✦효과✦ ${target.name} [흠집 ${scratchStacks}스택]: 추가타 발생.`
        );
        let bonusSkillPowerPercent = 0;
        if (scratchStacks === 1) bonusSkillPowerPercent = 0.25;
        else if (scratchStacks === 2) bonusSkillPowerPercent = 0.35;
        else if (scratchStacks >= 3) bonusSkillPowerPercent = 0.45;

        for (let i = 0; i < 2; i++) {
          const bonusDamage = calculateDamage(
            caster,
            target,
            bonusSkillPowerPercent,
            damageType,
            statTypeToUse
          );
          target.takeDamage(bonusDamage, battleLog, caster);
          battleLog(
            `  ✦추가 피해✦ [흠집 효과] ${i + 1}회: ${
              target.name
            }에게 ${bonusDamage} 추가 ${damageTypeKorean} 피해.`
          );
          if (!target.isAlive) break;
        }

        if (target.isAlive) target.removeDebuffById("scratch");
        battleLog(`✦정보✦ ${target.name}: [흠집] 효과 소멸.`);
      }
      return true;
    },
  },

  // [간파]
  SKILL_DISCERNMENT: {
    id: "SKILL_DISCERNMENT",
    name: "간파",
    type: "단일 공격",
    description:
      "숨죽인 무대에는 벌어질 틈이 감춰져 있다.<br><br>공격력/마법 공격력 260% 공격(2타). 이후 공격력/마법 공격력 200%의 피해를 가하며 상대에게 [쇠약] 상태 부여. <br>[쇠약]: 지속 2 턴. 공격 시 피해량 -20%.",
    targetType: "single_enemy",
    targetSelection: "enemy",
    execute: (caster, target, allies, enemies, battleLog) => {
      if (!target) {
        battleLog(
          `✦정보✦ ${caster.name} [간파]: 스킬 대상을 찾을 수 없습니다.`
        );
        return false;
      }
      if (!target.isAlive) {
        battleLog(
          `✦정보✦ ${caster.name} [간파]: 대상(${target.name})이 이미 쓰러져 있습니다.`
        );
        return false;
      }

      const damageType =
        caster.getEffectiveStat("atk") >= caster.getEffectiveStat("matk")
          ? "physical"
          : "magical";
      const damageTypeKorean = damageType === "physical" ? "물리" : "마법";
      const skillPower1 = damageType === "physical" ? 2.6 : 2.6;

      battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [간파] 2연타 공격.`);
      for (let i = 0; i < 2; i++) {
        const damage1 = calculateDamage(
          caster,
          target,
          skillPower1 / 2,
          damageType
        );
        target.takeDamage(damage1, battleLog, caster);
        battleLog(
          `  ✦피해✦ [간파] ${i + 1}타: ${
            target.name
          }에게 ${damage1} ${damageTypeKorean} 피해.`
        );
        if (!target.isAlive) return true;
      }

      const skillPower2 = damageType === "physical" ? 2.0 : 2.0;
      const damage2 = calculateDamage(caster, target, skillPower2, damageType);
      target.takeDamage(damage2, battleLog, caster);
      battleLog(
        `✦추가 피해✦ ${caster.name} [간파 효과]: ${target.name}에게 ${damage2} 추가 ${damageTypeKorean} 피해.`
      );
      if (!target.isAlive) return true;

      target.addDebuff("weakness", "[쇠약]", 2, {
        damageMultiplierReduction: 0.2,
        category: "상태 이상",
      });
      battleLog(`✦상태 이상✦ ${target.name}, [쇠약] 효과 적용 (2턴).`);
      return true;
    },
  },

  // [파열]
  SKILL_RUPTURE: {
    id: "SKILL_RUPTURE",
    name: "파열",
    type: "광역 공격",
    description:
      "균열은 가장 고요한 순간에 일어난다.<br><br> 시전자 타입 기반 주 목표에게 공/마공 210% 피해, 주 목표 제외 모든 적에게 공/마공 140% 피해. [쇠약] 상태 적에게 적중 시 추가로 공/마공 30% 고정 피해. (쿨타임 2턴)",
    targetType: "single_enemy",
    targetSelection: "enemy",
    cooldown: 3,
    execute: (caster, mainTarget, allies, enemies, battleLog) => {
      if (!mainTarget) {
        battleLog(`✦정보✦ ${caster.name} [파열]: 주 대상을 찾을 수 없습니다.`);
        return false;
      }
      if (!mainTarget.isAlive) {
        battleLog(
          `✦정보✦ ${caster.name} [파열]: 주 대상 ${mainTarget.name}은(는) 이미 쓰러져 있습니다.`
        );
        return false;
      }

      const lastUsed = caster.lastSkillTurn[SKILLS.SKILL_RUPTURE.id] || 0;
      if (
        lastUsed !== 0 &&
        currentTurn - lastUsed < SKILLS.SKILL_RUPTURE.cooldown
      ) {
        battleLog(
          `✦정보✦ ${caster.name}, [파열] 사용 불가: 쿨타임 ${
            SKILLS.SKILL_RUPTURE.cooldown - (currentTurn - lastUsed)
          }턴 남음.`
        );
        return false;
      }

      let statTypeToUse;
      let damageType;
      if (caster.type === "암석" || caster.type === "야수") {
        statTypeToUse = "atk";
        damageType = "physical";
      } else if (caster.type === "천체" || caster.type === "나무") {
        statTypeToUse = "matk";
        damageType = "magical";
      } else {
        statTypeToUse =
          caster.getEffectiveStat("atk") >= caster.getEffectiveStat("matk")
            ? "atk"
            : "matk";
        damageType = statTypeToUse === "atk" ? "physical" : "magical";
      }
      const damageTypeKorean = damageType === "physical" ? "물리" : "마법";

      battleLog(
        `✦스킬✦ ${caster.name}, [파열] 사용. 주 대상: ${mainTarget.name}.`
      );

      const mainSkillPower = 2.1;
      const mainDamage = calculateDamage(
        caster,
        mainTarget,
        mainSkillPower,
        damageType,
        statTypeToUse
      );
      mainTarget.takeDamage(mainDamage, battleLog, caster);
      battleLog(
        `  ✦피해✦ [파열 주 대상] ${mainTarget.name}: ${mainDamage} ${damageTypeKorean} 피해.`
      );

      if (mainTarget.isAlive && mainTarget.hasDebuff("weakness")) {
        const bonusFixedDamageValue =
          caster.getEffectiveStat(statTypeToUse) * 0.3;
        const actualBonusFixedDamage = calculateDamage(
          caster,
          mainTarget,
          bonusFixedDamageValue,
          "fixed"
        );
        mainTarget.takeDamage(actualBonusFixedDamage, battleLog, caster);
        battleLog(
          `  ✦추가 피해✦ ${mainTarget.name} ([쇠약] 대상): ${actualBonusFixedDamage} 추가 고정 피해.`
        );
      }

      const subTargets = enemies.filter(
        (e) => e.isAlive && e.id !== mainTarget.id
      );
      if (subTargets.length > 0) {
        battleLog(`  ✦파열 부가 대상 공격 시작 (총 ${subTargets.length}명)`);
        const subSkillPower = 1.4;
        subTargets.forEach((subTarget) => {
          if (!subTarget.isAlive) return;
          const subDamage = calculateDamage(
            caster,
            subTarget,
            subSkillPower,
            damageType,
            statTypeToUse
          );
          subTarget.takeDamage(subDamage, battleLog, caster);
          battleLog(
            `    ✦피해✦ [파열 부 대상] ${subTarget.name}: ${subDamage} ${damageTypeKorean} 피해.`
          );

          if (subTarget.isAlive && subTarget.hasDebuff("weakness")) {
            const bonusFixedDamageValueSub =
              caster.getEffectiveStat(statTypeToUse) * 0.3;
            const actualBonusFixedDamageSub = calculateDamage(
              caster,
              subTarget,
              bonusFixedDamageValueSub,
              "fixed"
            );
            subTarget.takeDamage(actualBonusFixedDamageSub, battleLog, caster);
            battleLog(
              `    ✦추가 피해✦ ${subTarget.name} ([쇠약] 대상): ${actualBonusFixedDamageSub} 추가 고정 피해.`
            );
          }
        });
      }
      caster.lastSkillTurn[SKILLS.SKILL_RUPTURE.id] = currentTurn;
      return true;
    },
  },

  // [공명]
  SKILL_RESONANCE: {
    id: "SKILL_RESONANCE",
    name: "공명",
    type: "지정 버프",
    description:
      "두 사람의 완벽한 조화는 곧 전체의 완성이다.<br><br>1) 지정 대상이 (잃은 체력x50%) 회복<br>2) 모든 상태 이상 정화<br>3) 시전자 [환원] 상태 진입. <br> [환원] 상태 시, 스킬 시전할 때 가장 낮은 체력 아군 (시전자 방어력x60%) 추가 회복 3턴 지속, 연달아 사용하더라도 최대 3턴. <br><b>* 기믹 오브젝트 '메마른 생명의 샘'에 사용 가능</b>",
    targetType: "single_ally_or_gimmick",
    targetSelection: "single_ally_or_gimmick",
    execute: (caster, target, allies, enemies, battleLog) => {
      if (!target) {
        battleLog(`✦정보✦ ${caster.name} [공명]: 대상을 찾을 수 없습니다.`);
        return false;
      }

      // 대상이 '메마른 생명의 샘'인 경우
      if (target.type === "spring") {
        const healAmount = Math.round(caster.getEffectiveStat("def") * 2); // 샘은 방어력 기반으로 치유
        target.healingReceived += healAmount;
        battleLog(`✦스킬✦ ${caster.name}, [${target.name}]에 [공명] 사용.`);
        logToBattleLog(
          `✦회복✦ [${target.name}]에 생명력을 ${healAmount} 주입합니다. (현재: ${target.healingReceived}/${target.healingGoal})`
        );
        displayCharacters(); // 샘의 숫자 UI 업데이트
        return true;
      }

      // 대상이 일반 아군인 경우 (기존 로직)
      if (!target.isAlive) {
        battleLog(`✦정보✦ ${caster.name} [공명]: 대상이 쓰러져 있습니다.`);
        return false;
      }

      const lostHp = target.maxHp - target.currentHp;
      let healAmount = Math.round(lostHp * 0.5);

      // 힐러 직군 효과 체크
      if (
        caster.job === "힐러" &&
        caster.currentHp <= caster.maxHp * 0.5 &&
        caster.healerBoostCount < 2
      ) {
        healAmount = Math.round(healAmount * 1.1);
        caster.healerBoostCount++;
        battleLog(
          `✦직군 효과(힐러)✦ [은총의 방패] 발동. 회복량이 10% 증가합니다. (남은 횟수: ${
            2 - caster.healerBoostCount
          })`
        );
      }

      battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [공명] 사용.`);
      applyHeal(target, healAmount, battleLog, "공명");

      if (target.debuffs.length > 0) {
        const cleansedDebuffs = target.debuffs.map((d) => d.name).join(", ");
        target.debuffs = [];
        battleLog(
          `✦정화✦ ${target.name}: 모든 디버프(${cleansedDebuffs})가 정화되었습니다.`
        );
      }

      caster.addBuff("restoration", "[환원]", 3, {
        description: "스킬 시전 시 체력이 가장 낮은 아군 추가 회복 (3턴).",
        healPower: Math.round(caster.getEffectiveStat("def") * 0.6),
      });
      battleLog(
        `✦버프✦ ${caster.name}: [환원] 상태가 되어 3턴간 스킬 사용 시 아군을 추가 회복합니다.`
      );

      // 서포터 직군 효과
      caster.checkSupporterPassive(battleLog);
      return true;
    },
  },

  // [보상]
  SKILL_COMPENSATION: {
    id: "SKILL_COMPENSATION",
    name: "보상",
    type: "지정 디버프",
    description:
      "대가는 본래 나만을 위함을 의미하는 것이 아니다.<br><br>1) 시전자 (전체 체력x15%) 타격(고정 피해)<br>2) 해당 대상에게 [전이] 부여. <br>[전이] 상태 시, 피격당하면 타격한 플레이어가 (대상 공격력x100%) 회복.",
    targetType: "single_enemy",
    targetSelection: "enemy",
    execute: (caster, target, allies, enemies, battleLog) => {
      if (!target || !target.isAlive) {
        battleLog(
          `✦정보✦ ${caster.name} [보상]: 대상을 찾을 수 없거나 대상이 쓰러져 있습니다.`
        );
        return false;
      }

      battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [보상] 사용.`);

      const selfDamage = Math.round(caster.maxHp * 0.15);
      caster.takeDamage(selfDamage, battleLog, null);
      battleLog(
        `✦소모✦ ${caster.name}: 스킬 대가로 ${selfDamage}의 피해를 입습니다.`
      );

      if (!caster.isAlive) return true;

      target.addDebuff("transfer", "[전이]", 2, {
        description: "피격 시 공격자를 (자신의 공격력x100%)만큼 회복시킴.",
        casterId: caster.id,
      });
      battleLog(`✦디버프✦ ${target.name}: [전이] 상태가 되었습니다 (2턴).`);

      return true;
    },
  },

  // [침전]
  SKILL_SEDIMENTATION: {
    id: "SKILL_SEDIMENTATION",
    name: "침전",
    type: "광역 버프",
    description:
      "희생은 언제나 숭고하다. 그러나 희생자는 누가 구할 것인가.<br><br>1) 시전자 (전체 체력x20%) 차감<br>2) 시전자 제외 전원 (잃은 체력x70%) 회복<br>3) [면역] 1회 부여. <br>[면역] 상태 시, 이후 상태 이상 1회 무조건 적용되지 않음. <br><b>* 기믹 오브젝트 '메마른 생명의 샘'에 회복 효과 적용 가능</b>",
    targetType: "all_allies",
    targetSelection: "all_allies",
    execute: (caster, allies, enemies, battleLog) => {
      battleLog(`✦스킬✦ ${caster.name}, [침전] 사용.`);

      const hpCost = Math.round(caster.maxHp * 0.2);
      caster.currentHp -= hpCost;
      battleLog(
        `✦소모✦ ${caster.name}: 자신을 희생하여 체력 ${hpCost}을 소모합니다.`
      );
      if (caster.currentHp <= 0) {
        caster.currentHp = 1;
        battleLog(
          `✦효과✦ ${caster.name}, 쓰러지기 직전이지만 효과는 발동됩니다.`
        );
      }

      // 힐러 직군 효과 체크용 변수
      let healMultiplier = 1.0;
      if (
        caster.job === "힐러" &&
        caster.currentHp <= caster.maxHp * 0.5 &&
        caster.healerBoostCount < 2
      ) {
        healMultiplier = 1.1;
        caster.healerBoostCount++;
        battleLog(
          `✦직군 효과(힐러)✦ [은총의 방패] 발동. 회복량이 10% 증가합니다. (남은 횟수: ${
            2 - caster.healerBoostCount
          })`
        );
      }

      // 1. 아군에게 효과 적용 (기존 로직)
      allies
        .filter((a) => a.isAlive && a.id !== caster.id)
        .forEach((ally) => {
          const lostHp = ally.maxHp - ally.currentHp;
          if (lostHp > 0) {
            let healAmount = Math.round(lostHp * 0.7 * healMultiplier);
            applyHeal(ally, healAmount, battleLog, "침전");
          }
          ally.addBuff("immunity", "[면역]", 2, {
            description: "다음 상태 이상 공격을 1회 무효화합니다.",
            singleUse: true,
          });
          battleLog(`✦버프✦ ${ally.name}: [면역](1회) 효과를 얻었습니다.`);
        });

      // 2. 기믹 오브젝트에게 효과 적용 (새로운 로직)
      // 설명과 기능을 일치시키기 위해, 맵에 '메마른 생명의 샘'이 존재하면 체력 소모량만큼 회복
      const spring = mapObjects.find((obj) => obj.type === "spring");
      if (spring) {
        const healAmount = hpCost; // 시전자가 소모한 체력만큼 샘을 회복
        spring.healingReceived += healAmount;
        battleLog(
          `✦회복✦ [${spring.name}]에 생명력을 ${healAmount} 주입합니다. (현재: ${spring.healingReceived}/${spring.healingGoal})`
        );
      }

      // 서포터 직군 효과
      caster.checkSupporterPassive(battleLog);

      displayCharacters(); // UI 즉시 갱신
      return true;
    },
  },

  // [차연]
  SKILL_DIFFERANCE: {
    id: "SKILL_DIFFERANCE",
    name: "차연",
    type: "광역 버프",
    description:
      "자기희생의 완결은 영원히 지연된다. 우리의 마음에 남아.<br><br>1) 시전자 (전체 체력x15%) 타격(고정 피해)<br>2) 시전자 (전체 체력x30%) 회복<br>3) 전원 [흔적] 상태 진입. <br>[흔적] 상태 시, 피격당한 아군의 현재 체력이 50% 이하라면 시전자가 (전체 체력x5%)를 잃고 아군 (전체 체력x25%) 회복 3턴 지속, 연달아 사용하더라도 최대 3턴",
    targetType: "all_allies",
    targetSelection: "all_allies",
    execute: (caster, allies, enemies, battleLog) => {
      battleLog(`✦스킬✦ ${caster.name}, [차연] 발동.`);

      const selfDamage = Math.round(caster.maxHp * 0.15);
      caster.takeDamage(selfDamage, battleLog, null);
      battleLog(
        `✦소모✦ ${caster.name}: 스킬 사용을 위해 ${selfDamage}의 피해를 입습니다.`
      );

      if (!caster.isAlive) return true;

      let selfHeal = Math.round(caster.maxHp * 0.3);

      // 힐러 직군 효과 체크
      if (
        caster.job === "힐러" &&
        caster.currentHp <= caster.maxHp * 0.5 &&
        caster.healerBoostCount < 2
      ) {
        selfHeal = Math.round(selfHeal * 1.1);
        caster.healerBoostCount++;
        battleLog(
          `✦직군 효과(힐러)✦ [은총의 방패] 발동. 회복량이 10% 증가합니다. (남은 횟수: ${
            2 - caster.healerBoostCount
          })`
        );
      }
      applyHeal(caster, selfHeal, battleLog, "차연");

      const allCharacters = [...allies, ...enemies];
      allCharacters
        .filter((c) => c.isAlive)
        .forEach((character) => {
          character.addBuff("trace", "[흔적]", 3, {
            description:
              "체력이 50% 이하일 때 피격 시, [차연] 시전자가 희생하여 자신을 회복시킴 (3턴).",
            originalCasterId: caster.id,
          });
          battleLog(
            `✦버프✦ ${character.name}: [흔적] 상태가 되었습니다. (3턴)`
          );
        });

      // 서포터 직군 효과
      caster.checkSupporterPassive(battleLog);

      return true;
    },
  },
};

// --- 몬스터 전용 스킬 객체 ---
const MONSTER_SKILLS = {
  SKILL_Seismic_Fissure: {
    id: "SKILL_Seismic_Fissure",
    name: "균열의 진동",
    type: "광역 공격",
    script: `\n<pre>마른 땅이 갈라지며 균열이 퍼져나간다.\n이 전장은 오로지 한 생명의 손아귀에 놓여 있다.\n"땅이 갈라지는 소리를 들은 적 있느냐."</pre>\n`,
    description: "피격 범위 내 모든 적에게 공격력만큼 피해를 줍니다.",
    targetType: "all_enemies",
    targetSelection: "all_enemies",
    execute: (caster, allies, enemies, battleLog) => {
      const hitArea = "1,1;2,1;3,1;1,2;3,2;1,3;2,3;3,3".split(";").map((s) => {
        const [x, y] = s.split(",").map(Number);
        return { x, y };
      });
      const damage = caster.getEffectiveStat("atk");

      enemies.forEach((target) => {
        if (
          hitArea.some((pos) => pos.x === target.posX && pos.y === target.posY)
        ) {
          battleLog(
            `✦광역 피해✦ ${caster.name}의 [균열의 진동]이 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);
        }
      });

      return true;
    },
  },

  SKILL_Echo_of_Silence: {
    id: "SKILL_Echo_of_Silence",
    name: "침묵의 메아리",
    type: "광역 디버프",
    script: `\n<pre>기묘한 울림이 공간을 가른다.\n거대한 풍광의 압을 앞에 두고, 달리 무엇을 말할 수 있겠는가?\n"자연의 숨결 앞에서는 그 어떤 주문도 무의미하다."</pre>\n`,
    description: "피격 범위 내 모든 적에게 [침묵]을 부여합니다.",
    targetType: "all_enemies",
    targetSelection: "all_enemies",
    execute: (caster, allies, enemies, battleLog) => {
      const hitArea = "0,2;1,1;3,1;2,0;4,2;1,3;3,3".split(";").map((s) => {
        const [x, y] = s.split(",").map(Number);
        return { x, y };
      });
      const targets = enemies.filter((target) =>
        hitArea.some((pos) => pos.x === target.posX && pos.y === target.posY)
      );
      const silenceDuration = targets.length;

      if (silenceDuration > 0) {
        targets.forEach((target) => {
          battleLog(
            `✦광역 디버프✦ ${caster.name}의 [침묵의 메아리]가 ${target.name}에게 적중.`
          );
          target.addDebuff("silence", "[침묵]", silenceDuration, {
            description: `버프, 디버프, 치료, 카운터 유형 주문 사용 불가 (${silenceDuration}턴)`,
          });
        });
      } else {
        battleLog(`✦효과 없음✦ [침묵의 메아리]의 영향을 받은 대상이 없습니다.`);
      }
      return true;
    },
  },

  SKILL_Crushing_Sky: {
    id: "SKILL_Crushing_Sky",
    name: "무너지는 하늘",
    type: "광역 공격",
    script: `\n<pre>거대한 석괴가 하늘에서 떨어지기 시작한다.\n때로 자연이라는 것은, 인간에게 이다지도 무자비하다.\n"대지가 너희에게 분노하리라."</pre>\n`,
    description: "피격 범위 내 모든 적에게 공격력만큼 피해를 줍니다.",
    targetType: "all_enemies",
    targetSelection: "all_enemies",
    execute: (caster, allies, enemies, battleLog) => {
      const hitArea = "2,0;2,1;0,2;1,2;3,2;4,2;2,3;2,4".split(";").map((s) => {
        const [x, y] = s.split(",").map(Number);
        return { x, y };
      });
      const damage = caster.getEffectiveStat("atk");

      enemies.forEach((target) => {
        if (
          hitArea.some((pos) => pos.x === target.posX && pos.y === target.posY)
        ) {
          battleLog(
            `✦광역 피해✦ ${caster.name}의 [무너지는 하늘]이 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);
        }
      });
      return true;
    },
  },

  SKILL_Birth_of_Vines: {
    id: "SKILL_Birth_of_Vines",
    name: "덩굴 탄생",
    type: "광역 공격",
    script: `\n<pre>바닥으로부터 수많은 덩굴이 솟구친다.\n벗어날 수 없는 공포가 당신의 발목을 옥죄어 온다.\n"이 땅에 모습을 드러낸 이들을, 잊지 않겠다."</pre>\n`,
    description: "지정된 범위에 마법 공격력만큼 피해를 줍니다.",
    targetType: "all_enemies",
    execute: (caster, allies, enemies, battleLog) => {
      const hitArea = "0,0;0,2;0,4;1,1;1,3;2,0;2,2;2,4;3,1;3,3;4,0;4,2;4,4"
        .split(";")
        .map((s) => {
          const [x, y] = s.split(",").map(Number);
          return { x, y };
        });
      const damage = caster.getEffectiveStat("matk");

      enemies.forEach((target) => {
        if (
          target.isAlive &&
          hitArea.some((pos) => pos.x === target.posX && pos.y === target.posY)
        ) {
          battleLog(
            `✦광역 피해✦ ${caster.name}의 [덩굴 탄생]이 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);
        }
      });
      return true;
    },
  },

  SKILL_Spores_of_Silence: {
    id: "SKILL_Spores_of_Silence",
    name: "침묵의 포자",
    type: "광역 디버프",
    script: `\n<pre>고운 꽃가루가 하늘을 뒤덮는다.\n생경한 아름다움은 고요한 찬사만을 강요한다.\n"많은 말은 필요하지 않은 법."</pre>\n`,
    description:
      "지정된 범위의 대상에게 [무장 해제] 디버프를 부여합니다. 지속 턴은 피격된 인원 수와 같습니다.",
    targetType: "all_enemies",
    execute: (caster, allies, enemies, battleLog) => {
      const hitArea = "0,0;1,0;2,0;3,0;4,0;0,2;1,2;3,2;4,2;0,4;1,4;2,4;3,4;4,4"
        .split(";")
        .map((s) => {
          const [x, y] = s.split(",").map(Number);
          return { x, y };
        });

      const targets = enemies.filter(
        (target) =>
          target.isAlive &&
          hitArea.some((pos) => pos.x === target.posX && pos.y === target.posY)
      );
      const debuffDuration = targets.length;

      if (debuffDuration > 0) {
        battleLog(
          `✦광역 디버프✦ ${caster.name}의 [침묵의 포자]가 ${targets
            .map((t) => t.name)
            .join(", ")}에게 적중.`
        );
        targets.forEach((target) => {
          target.addDebuff("disarm", "[무장 해제]", debuffDuration, {
            description: `공격 유형 스킬 사용 불가 (${debuffDuration}턴)`,
          });
        });
      } else {
        battleLog(`✦효과 없음✦ [침묵의 포자]의 영향을 받은 대상이 없습니다.`);
      }
      return true;
    },
  },

  SKILL_Slapstick_Comdey_P: {
    id: "SKILL_Slapstick_Comdey_P",
    name: "슬랩스틱 코미디(피에로)",
    type: "광역 공격",
    script: `\n<pre>와장창! 어때, 어때? 놀랐지?!</pre>\n`,
    description: "자신을 기준으로 고정된 범위에 물리 피해를 줍니다.",
    execute: (caster, allies, enemies, battleLog) => {
      const relativeOffsets = [
        { dx: 0, dy: -2 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: 2 },
      ];
      const damage = caster.getEffectiveStat("atk");

      enemies.forEach((target) => {
        const isHit = relativeOffsets.some(
          (offset) =>
            caster.posX + offset.dx === target.posX &&
            caster.posY + offset.dy === target.posY
        );
        if (isHit) {
          battleLog(
            `✦피해✦ ${caster.name}의 [슬랩스틱 코미디]가 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);

          // 시전자가 폭주 상태라면, 랜덤 디버프 추가
          if (caster.hasBuff("duet_enrage")) {
            const debuffs = [
              { id: "melancholy_brand", name: "[우울 낙인]" },
              { id: "ecstasy_brand", name: "[환희 낙인]" },
              { id: "nightmare", name: "[악몽]" },
            ];
            const randomDebuff =
              debuffs[Math.floor(Math.random() * debuffs.length)];
            target.addDebuff(randomDebuff.id, randomDebuff.name, 99, {
              unremovable: false,
            });
            logToBattleLog(
              ` ↪︎ 폭주한 공격이 ${target.name}에게 ${randomDebuff.name}을 남깁니다.`
            );
          }
        }
      });
      return true;
    },
  },

  SKILL_Slapstick_Comdey_C: {
    id: "SKILL_Slapstick_Comdey_C",
    name: "슬랩스틱 코미디(클라운)",
    type: "광역 공격",
    script: `\n<pre>하핫! 다, 다들 즐겁지? 응……?</pre>\n`,
    description: "자신을 기준으로 고정된 범위에 마법 피해를 줍니다.",
    execute: (caster, allies, enemies, battleLog) => {
      const relativeOffsets = [
        { dx: -2, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 2, dy: 0 },
      ];
      const damage = caster.getEffectiveStat("matk");

      enemies.forEach((target) => {
        const isHit = relativeOffsets.some(
          (offset) =>
            caster.posX + offset.dx === target.posX &&
            caster.posY + offset.dy === target.posY
        );
        if (isHit) {
          battleLog(
            `✦피해✦ ${caster.name}의 [슬랩스틱 코미디]가 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);

          // 시전자가 폭주 상태라면, 랜덤 디버프 추가
          if (caster.hasBuff("duet_enrage")) {
            const debuffs = [
              { id: "melancholy_brand", name: "[우울 낙인]" },
              { id: "ecstasy_brand", name: "[환희 낙인]" },
              { id: "nightmare", name: "[악몽]" },
            ];
            const randomDebuff =
              debuffs[Math.floor(Math.random() * debuffs.length)];
            target.addDebuff(randomDebuff.id, randomDebuff.name, 99, {
              unremovable: false,
            });
            logToBattleLog(
              `✦추가✦ 폭주한 공격이 ${target.name}에게 ${randomDebuff.name}을 남깁니다.`
            );
          }
        }
      });
      return true;
    },
  },

  SKILL_Get_a_Present_P: {
    id: "SKILL_Get_a_Present_P",
    name: "선물 받아!(피에로)",
    type: "광역 공격",
    script: `\n<pre>깜~짝 선물 등장이요!</pre>\n`,
    description: "자신을 기준으로 고정된 범위에 물리 피해를 줍니다.",
    execute: (caster, allies, enemies, battleLog) => {
      const relativeOffsets = [
        { dx: -1, dy: -1 },
        { dx: -1, dy: 0 },
        { dx: -1, dy: 1 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: -1 },
        { dx: 1, dy: 0 },
        { dx: 1, dy: 1 },
      ];
      const damage = caster.getEffectiveStat("atk");
      enemies.forEach((target) => {
        const isHit = relativeOffsets.some(
          (offset) =>
            caster.posX + offset.dx === target.posX &&
            caster.posY + offset.dy === target.posY
        );
        if (isHit) {
          battleLog(
            `✦피해✦ ${caster.name}의 [선물 받아!]가 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);

          // 시전자가 폭주 상태라면, 랜덤 디버프 추가
          if (caster.hasBuff("duet_enrage")) {
            const debuffs = [
              { id: "melancholy_brand", name: "[우울 낙인]" },
              { id: "ecstasy_brand", name: "[환희 낙인]" },
              { id: "nightmare", name: "[악몽]" },
            ];
            const randomDebuff =
              debuffs[Math.floor(Math.random() * debuffs.length)];
            target.addDebuff(randomDebuff.id, randomDebuff.name, 99, {
              unremovable: false,
            });
            logToBattleLog(
              `✦추가✦ 폭주한 공격이 ${target.name}에게 ${randomDebuff.name}을 남깁니다.`
            );
          }
        }
      });
      return true;
    },
  },

  SKILL_Get_a_Present_C: {
    id: "SKILL_Get_a_Present_C",
    name: "선물 받아!(클라운)",
    type: "광역 공격",
    script: `\n<pre>깜짝 선물, 줘야 한댔어…….</pre>\n`,
    description: "자신을 기준으로 고정된 범위에 마법 피해를 줍니다.",
    execute: (caster, allies, enemies, battleLog) => {
      const relativeOffsets = [
        { dx: -2, dy: -2 },
        { dx: -2, dy: 2 },
        { dx: -1, dy: -1 },
        { dx: -1, dy: 1 },
        { dx: 1, dy: -1 },
        { dx: 1, dy: 1 },
        { dx: 2, dy: -2 },
        { dx: 2, dy: 2 },
      ];
      const damage = caster.getEffectiveStat("matk");
      enemies.forEach((target) => {
        const isHit = relativeOffsets.some(
          (offset) =>
            caster.posX + offset.dx === target.posX &&
            caster.posY + offset.dy === target.posY
        );
        if (isHit) {
          battleLog(
            `✦피해✦ ${caster.name}의 [선물 받아!]가 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);

          // 시전자가 폭주 상태라면, 랜덤 디버프 추가
          if (caster.hasBuff("duet_enrage")) {
            const debuffs = [
              { id: "melancholy_brand", name: "[우울 낙인]" },
              { id: "ecstasy_brand", name: "[환희 낙인]" },
              { id: "nightmare", name: "[악몽]" },
            ];
            const randomDebuff =
              debuffs[Math.floor(Math.random() * debuffs.length)];
            target.addDebuff(randomDebuff.id, randomDebuff.name, 99, {
              unremovable: false,
            });
            logToBattleLog(
              `✦추가✦ 폭주한 공격이 ${target.name}에게 ${randomDebuff.name}을 남깁니다.`
            );
          }
        }
      });
      return true;
    },
  },

  GIMMICK_Laugh_of: {
    id: "GIMMICK_Laugh_of",
    name: "광대의 웃음",
    type: "기믹",
    script: `\n<pre>퍼레이드 음악이 늘어지며, 일그러진다.\n불협화음 속으로 섬찟한 웃음소리가 들린다.\n"광대는 언제나 감정에 따라 춤을 추지. 함께 웃어 줄래?"</pre>\n`,
    description: "광대의 감정 기믹을 발동시킵니다.",
    execute: (caster, allies, enemies, battleLog) => {
      if (
        activeGimmickState &&
        activeGimmickState.type.startsWith("clown_emotion")
      ) {
        battleLog("✦정보✦ 이미 광대의 감정 기믹이 활성화되어 있습니다.");
        return false;
      }
      logToBattleLog(
        "✦기믹 발생✦ [광대의 웃음]: 3턴 안에, 클라운을 5회 이상, 피에로를 5회 이하로 공격해야 합니다."
      );
      activeGimmickState = {
        type: "clown_emotion_laugh",
        turnStart: currentTurn,
        duration: 3, // 기믹 지속 턴
        clownHits: 0,
        pierrotHits: 0,
      };
      return true;
    },
  },

  GIMMICK_Tears_of: {
    id: "GIMMICK_Tears_of",
    name: "광대의 눈물",
    type: "기믹",
    script: `\n<pre>퍼레이드 음악이 늘어지며, 일그러진다.\n불협화음 속으로 섬찟한 울음소리가 들린다.\n"광대는 언제나 감정에 따라 춤을 추지. 함께 울어 줄래?"</pre>\n`,
    description: "광대의 감정 기믹을 발동시킵니다.",
    execute: (caster, allies, enemies, battleLog) => {
      if (
        activeGimmickState &&
        activeGimmickState.type.startsWith("clown_emotion")
      ) {
        battleLog("✦정보✦ 이미 광대의 감정 기믹이 활성화되어 있습니다.");
        return false;
      }
      logToBattleLog(
        "✦기믹 발생✦ [광대의 눈물]: 3턴 안에, 피에로를 5회 이상, 클라운을 5회 이하로 공격해야 합니다."
      );
      activeGimmickState = {
        type: "clown_emotion_tear",
        turnStart: currentTurn,
        duration: 3, // 기믹 지속 턴
        clownHits: 0,
        pierrotHits: 0,
      };
      return true;
    },
  },

  SKILL_Seeds_Wrath: {
    id: "SKILL_Seeds_Wrath",
    name: "씨앗의 분노",
    type: "광역 복합",
    script: `\n<pre>땅속 깊은 곳에서 들려오는 불길한 진동.\n잠들어 있던 씨앗이 한순간 깨어난다.\n"분노하라. 그리하여 너희를 삼킬 것이다."</pre>\n`,
    description: "두 종류의 범위에 각각 다른 효과를 부여합니다.",
    targetType: "all_enemies",
    execute: (caster, allies, enemies, battleLog) => {
      const greenHitArea = "1,1;1,2;1,3;2,1;2,3;3,1;3,2;3,3"
        .split(";")
        .map((s) => s.split(",").map(Number));
      const blueHitArea = "0,0;0,4;4,0;4,4"
        .split(";")
        .map((s) => s.split(",").map(Number));
      const damage = caster.getEffectiveStat("matk");

      enemies.forEach((target) => {
        if (!target.isAlive) return;
        // 초록 피격 범위: 데미지
        if (
          greenHitArea.some(
            (pos) => pos[0] === target.posX && pos[1] === target.posY
          )
        ) {
          battleLog(
            `✦피해✦ ${caster.name}의 [씨앗의 분노]가 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);
        }
        // 파란 피격 범위: 무장 해제
        if (
          blueHitArea.some(
            (pos) => pos[0] === target.posX && pos[1] === target.posY
          )
        ) {
          battleLog(
            `✦디버프✦ ${caster.name}의 [씨앗의 분노]가 ${target.name}에게 [무장 해제] 부여.`
          );
          target.addDebuff("disarm", "[무장 해제]", 1, {
            description: `공격 유형 스킬 사용 불가 (1턴)`,
          });
        }
      });
      return true;
    },
  },

  GIMMICK_Path_of_Ruin: {
    id: "GIMMICK_Path_of_Ruin",
    name: "균열의 길",
    type: "기믹",
    description: "무작위 행과 열에 공격을 예고합니다.",
    targetType: "self",
    execute: (caster, allies, enemies, battleLog, dynamicData) => {
      if (caster.hasBuff("path_of_ruin_telegraph")) return false;
      const { predictedCol, predictedRow } = dynamicData;

      caster.addBuff("path_of_ruin_telegraph", "균열의 길 예고", 2, {
        predictedCol,
        predictedRow,
      });

      return true;
    },
  },

  GIMMICK_Seed_of_Devour: {
    id: "GIMMICK_Seed_of_Devour",
    name: "흡수의 술식",
    type: "기믹",
    description: "세 가지 형태의 기믹 중 하나를 무작위로 발동합니다.",
    targetType: "self",
    execute: (caster, allies, enemies, battleLog, dynamicData) => {
      // previewEnemyAction에서 스크립트 출력 및 모든 결정을 처리하므로, 여기서는 받은 데이터를 기반으로 실행만
      if (activeGimmickState) return false;

      const { subGimmickChoice, objectsToSpawnInfo } = dynamicData;

      if (!subGimmickChoice || !objectsToSpawnInfo) {
        console.error(
          "[ERROR] Seed of Devour 실행 오류: dynamicData를 받지 못했습니다."
        );
        return false;
      }

      const gimmickInfo =
        GIMMICK_DATA.GIMMICK_Seed_of_Devour[`subGimmick${subGimmickChoice}`];
      // ✦기믹 발생✦ 로그는 행동의 결과를 알려 주므로 유지
      battleLog(
        `✦기믹 발생✦ [흡수의 술식 - ${gimmickInfo.name}]: ${gimmickInfo.description}`
      );

      activeGimmickState = {
        type: `subGimmick${subGimmickChoice}`,
        startTurn: currentTurn,
        objectIds: [],
      };

      objectsToSpawnInfo.forEach((info) => {
        let newObject = {
          id: `${info.type}_${Math.random().toString(36).substring(2, 9)}`,
          type: info.type,
          name: "",
          posX: info.pos.x,
          posY: info.pos.y,
          isGimmickObject: true,
          isAlive: true,
        };

        if (info.type === "fruit") {
          newObject.name = "열매";
          newObject.hp = 1;
        } else if (info.type === "fissure") {
          newObject.name = "불안정한 균열";
        } else if (info.type === "spring") {
          newObject.name = "메마른 생명의 샘";
          newObject.healingReceived = 0;
          newObject.healingGoal = 50;
        }

        mapObjects.push(newObject);
        characterPositions[`${info.pos.x},${info.pos.y}`] = newObject.id;
        activeGimmickState.objectIds.push(newObject.id);
      });

      displayCharacters();
      return true;
    },
  },

  SKILL_Thread_of_Emotion: {
    id: "SKILL_Thread_of_Emotion",
    name: "감정의 실",
    type: "광역 디버프",
    script: `\n<pre>색색의 리본이 솟구쳐 가느다란 손가락을 감싼다.\n그것은 누군가의 의지를, 자아를, 이성을, 손쉽게 조롱한다.\n"기쁨도, 공포도. 모두 내려놓고 나에게 몸을 맡기는 게 어떻겠니."</pre>\n`,
    execute: (caster, allies, enemies, battleLog) => {
      const hitArea =
        "0,0;1,0;1,1;2,0;2,1;2,2;3,0;3,1;3,2;3,3;4,0;4,1;4,2;4,3;5,0;5,1;5,2;5,3;6,0;6,1;6,2;7,0;7,1;8,0;0,8;1,7;1,8;2,6;2,7;2,8;3,5;3,6;3,7;3,8;4,5;4,6;4,7;4,8;5,5;5,6;5,7;5,8;6,6;6,7;6,8;7,7;7,8;8,8"
          .split(";")
          .map((s) => s.split(",").map(Number));
      enemies.forEach((target) => {
        if (
          target.isAlive &&
          hitArea.some(
            (pos) => pos[0] === target.posX && pos[1] === target.posY
          )
        ) {
          logToBattleLog(` ↪︎ [감정의 실]이 ${target.name}을(를) 휘감습니다.`);
          target.addDebuff("melancholy_brand", "[우울 낙인]", 99, {});
          target.addDebuff("ecstasy_brand", "[환희 낙인]", 99, {});
          target.addDebuff("nightmare", "[악몽]", 99, {});
        }
      });
      return true;
    },
  },

  SKILL_Play1: {
    id: "SKILL_Play1",
    name: "유희(1,3,5타)",
    type: "광역 공격",
    script: `\n<pre>불꽃의 고리가 무대 위를 전부 태울 듯 회전한다.\n박자를 놓치는 순간, 불길이 당신을 스쳐 간다.\n"집중이 깨지는 순간을 조심해야 해. 다칠지도 모르니."</pre>\n`,
    description: "지정된 범위의 대상에게 마법 공격력만큼 피해를 줍니다.",
    execute: (caster, allies, enemies, battleLog) => {
      // README에 명시된 좌표를 그대로 사용해요.
      const hitArea =
        "0,4;1,4;2,4;3,4;5,4;6,4;7,4;8,4;4,0;4,1;4,2;4,3;4,5;4,6;4,7;4,8"
          .split(";")
          .map((s) => {
            const [x, y] = s.split(",").map(Number);
            return { x, y };
          });
      const damage = caster.getEffectiveStat("matk");

      enemies.forEach((target) => {
        // 모든 '적(플레이어)'을 확인해서
        // 좌표가 공격 범위 안에 있다면 데미지를 줍니다.
        if (
          target.isAlive &&
          hitArea.some((pos) => pos.x === target.posX && pos.y === target.posY)
        ) {
          battleLog(
            `✦광역 피해✦ ${caster.name}의 [유희]가 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);
        }
      });
      return true;
    },
  },

  SKILL_Play2: {
    id: "SKILL_Play2",
    name: "유희(2,4타)",
    type: "광역 공격",
    script: `\n<pre>불꽃의 고리가 무대 위를 전부 태울 듯 회전한다.\n박자를 놓치는 순간, 불길이 당신을 스쳐 간다.\n"집중이 깨지는 순간을 조심해야 해. 다칠지도 모르니."</pre>\n`,
    description: "지정된 범위의 대상에게 마법 공격력만큼 피해를 줍니다.",
    execute: (caster, allies, enemies, battleLog) => {
      const hitArea =
        "0,0;1,1;2,2;3,3;5,5;6,6;7,7;8,8;0,8;1,7;2,6;3,5;5,3;6,2;7,1;8,0"
          .split(";")
          .map((s) => {
            const [x, y] = s.split(",").map(Number);
            return { x, y };
          });
      const damage = caster.getEffectiveStat("matk");

      enemies.forEach((target) => {
        if (
          target.isAlive &&
          hitArea.some((pos) => pos.x === target.posX && pos.y === target.posY)
        ) {
          battleLog(
            `✦광역 피해✦ ${caster.name}의 [유희]가 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);
        }
      });
      return true;
    },
  },

  SKILL_Crimson: {
    id: "SKILL_Crimson",
    name: "진홍",
    type: "광역 복합",
    script: `\n<pre>장난감들이 공중에서 빙글빙글 돌며 떨어진다.\n그것들이 바닥에 닿을 때, 무대는 숨을 멈춘다.\n"그 표정, 무대 위에서 더 보고 싶어. 이리 올라오렴."</pre>\n`,
    description:
      "두 종류의 범위에 각각 다른 효과를 부여합니다. 한쪽은 디버프, 다른 한쪽은 피해를 줍니다.",
    execute: (caster, allies, enemies, battleLog) => {
      const debuffArea =
        "0,0;0,1;0,2;0,3;0,4;0,5;0,6;0,7;0,8;1,0;1,8;2,0;2,8;3,0;3,8;4,0;4,8;5,0;5,8;6,0;6,8;7,0;7,8;8,0;8,1;8,2;8,3;8,4;8,5;8,6;8,7;8,8;3,3;3,5;5,3;5,5"
          .split(";")
          .map((s) => s.split(",").map(Number));
      const damageArea =
        "1,1;1,7;2,2;2,3;2,5;2,6;3,2;3,4;3,6;4,3;4,5;5,2;5,4;5,6;6,2;6,3;6,5;6,6;7,1;7,7"
          .split(";")
          .map((s) => s.split(",").map(Number));
      const damage = caster.getEffectiveStat("matk");

      enemies.forEach((target) => {
        if (!target.isAlive) return;
        // 디버프 범위에 있다면 3종 디버프를 모두 걸어요.
        if (
          debuffArea.some(
            (pos) => pos[0] === target.posX && pos[1] === target.posY
          )
        ) {
          logToBattleLog(
            `✦광역 디버프✦ ${caster.name}의 [진홍] 효과가 ${target.name}에게 적용됩니다.`
          );
          target.addDebuff("melancholy_brand", "[우울 낙인]", 99, {
            unremovable: false,
          }); // 영구 디버프지만, 해제는 가능하게
          target.addDebuff("ecstasy_brand", "[환희 낙인]", 99, {
            unremovable: false,
          });
          target.addDebuff("nightmare", "[악몽]", 99, { unremovable: false });
        }
        // 데미지 범위에 있다면 피해를 줍니다.
        if (
          damageArea.some(
            (pos) => pos[0] === target.posX && pos[1] === target.posY
          )
        ) {
          logToBattleLog(
            `✦광역 피해✦ ${caster.name}의 [진홍]이 ${target.name}에게 적중.`
          );
          target.takeDamage(damage, battleLog, caster);
        }
      });
      return true;
    },
  },

  SKILL_Silence: {
    id: "SKILL_Silence",
    name: "침묵",
    type: "특수",
    script: `\n<pre>불협화음은 예고 없이 중단된다.\n인형의 동작은 크게 흔들리고, 무대 위에서 비틀거린다.\n"이건 예정된 장면이 아니야……."</pre>\n`,
    description:
      "보스가 그로기 상태에 빠져 1 턴 공격 불가 및 플레이어들의 공격에 10% 추가 피해를 입습니다.",
    execute: (caster, allies, enemies, battleLog) => {
      logToBattleLog(
        `✦특수 패턴✦ ${caster.name}이 맹공에 정신을 차리지 못하고 [침묵] 상태에 빠집니다.`
      );
      // 보스 자신에게 'groggy'라는 디버프를 걸어서 2턴(이번 턴, 다음 턴)동안 행동불가 상태
      caster.addDebuff("groggy", "[침묵](그로기)", 2, {
        description: "행동 불가 및 받는 피해 증가",
      });
      return true;
    },
  },
};

// --- 0.5. HTML 요소 가져오기 헬퍼 함수 ---
function getElement(id) {
  return document.getElementById(id);
}

// --- 1. 전역 변수 및 UI 요소 ---
let allyCharacters = [];
let enemyCharacters = [];
let mapObjects = [];
let activeGimmickState = null;
let currentTurn = 0;
let isBattleStarted = false;
let currentMapId = null;
let playerActionsQueue = [];
let characterPositions = {};
let actedAlliesThisTurn = []; // 이번 턴에 행동을 마친 아군 ID 목록
let playerAttackCountThisTurn = 0;

// 0: 기본 9x9, 1: 7x7로 축소(HP 50%), 2: 5x5로 축소(HP 20%)
let mapShrinkState = 0;

let minionsWipedOutTurn = 0; // 앵콜 기믹용: 쫄병이 전멸한 턴을 기록
let duetState = {
  // 이중창 기믹용 상태
  isConditionMet: false, // 한 종류만 남은 상태인가?
  turnConditionFirstMet: 0, // 언제 그 상태가 되었는가?
};

// null이면 미션 없음, 객체가 할당되면 미션 진행 중
let activeMission = null;

let selectedAction = {
  type: null,
  casterId: null,
  skillId: null,
  targetId: null,
  subTargetId: null,
  moveDelta: null,
};

const skillSelectionArea = getElement("skillSelectionArea");
const currentActingCharName = getElement("currentActingCharName");
const availableSkillsDiv = getElement("availableSkills");
const movementControlsArea = getElement("movementControlsArea");
const selectedTargetName = getElement("selectedTargetName");
const confirmActionButton = getElement("confirmActionButton");
const executeTurnButton = getElement("executeTurnButton");
const startButton = getElement("startButton");
// const nextTurnButton = getElement('nextTurnButton'); // 수정: 사용되지 않으므로 제거
const battleLogDiv = getElement("battleLog");
const mapGridContainer = getElement("mapGridContainer");
const skillDescriptionArea = getElement("skillDescriptionArea");
const allySelectionButtonsDiv = getElement("allySelectionButtons");

// --- 2. 핵심 클래스 정의 ---
class Character {
  constructor(name, type, job, currentHpOverride = null) {
    this.id = Math.random().toString(36).substring(2, 11);
    this.name = name;
    this.type = type;
    this.job = job;

    // 기본 스탯
    this.atk = 15;
    this.matk = 15;
    this.def = 15;
    this.mdef = 15;
    this.maxHp = 100;

    // 영감(type)에 따른 스탯 보정
    switch (type) {
      case "천체":
        this.matk = 20;
        break;
      case "암석":
        this.def = 20;
        break;
      case "야수":
        this.atk = 20;
        break;
      case "나무":
        this.mdef = 20;
        break;
    }

    // 직군(job)에 따른 스탯 보정
    if (this.job === "딜러") {
      this.atk += 5;
      this.matk += 5;
      this.maxHp = 90;
    } else if (this.job === "힐러") {
      this.maxHp = 110;
    }

    this.currentHp =
      currentHpOverride !== null &&
      !isNaN(currentHpOverride) &&
      currentHpOverride > 0
        ? Math.min(currentHpOverride, this.maxHp)
        : this.maxHp;
    if (this.currentHp > this.maxHp) this.currentHp = this.maxHp;

    this.isAlive = true;
    this.skills = Object.values(SKILLS).map((skill) => skill.id);
    this.buffs = [];
    this.debuffs = [];
    this.shield = 0;
    this.aggroDamageStored = 0;
    this.lastSkillTurn = {};
    this.lastAttackedBy = null;
    this.currentTurnDamageTaken = 0;
    this.totalDamageTakenThisBattle = 0;

    // 직군별 전투 카운터
    this.dealerExtraDamageCount = 0;
    this.healerBoostCount = 0;
    this.supporterShieldCount = 0;

    this.gimmicks = []; // 몬스터가 가진 기믹 목록
    this.activeGimmick = null; // 현재 활성화된 기믹 ID
    this.isEnraged = false;

    this.posX = -1;
    this.posY = -1;
  }

  addBuff(id, name, turns, effect, unremovable = false, isStacking = false) {
    let existingBuff = this.buffs.find((b) => b.id === id);

    if (existingBuff && existingBuff.effect.shieldAmount && !isStacking) {
      this.shield = Math.max(0, this.shield - existingBuff.effect.shieldAmount);
    }

    if (existingBuff) {
      existingBuff.turnsLeft = Math.max(existingBuff.turnsLeft, turns);
      if (isStacking && effect.stacks && existingBuff.stacks !== undefined) {
        existingBuff.stacks += effect.stacks;
      } else if (effect.stacks) {
        existingBuff.stacks = effect.stacks;
      }
      existingBuff.effect = { ...existingBuff.effect, ...effect };
      if (effect.lastAppliedTurn)
        existingBuff.lastAppliedTurn = effect.lastAppliedTurn;
    } else {
      existingBuff = {
        id,
        name,
        turnsLeft: turns,
        effect,
        unremovable,
        stacks: effect.stacks || 1,
      };
      if (effect.lastAppliedTurn)
        existingBuff.lastAppliedTurn = effect.lastAppliedTurn;
      this.buffs.push(existingBuff);
    }

    if (effect.shieldAmount && typeof effect.shieldAmount === "number") {
      this.shield += effect.shieldAmount;

      // 탱커 직군 효과: 보호막 획득 시 최대 체력 증가
      if (this.job === "탱커") {
        const maxHpGain = effect.shieldAmount * 0.0002;
        this.maxHp += maxHpGain;
        this.currentHp += maxHpGain; // 최대 체력이 늘어난 만큼 현재 체력도 채워줌
        logToBattleLog(
          `✦직군 효과(탱커)✦ [불굴의 맹세] 발동. 최대 체력이 ${maxHpGain.toFixed(
            2
          )} 증가합니다.`
        );
      }
    }
  }

  addDebuff(id, name, turns, effect) {
    const immunityBuff = this.buffs.find(
      (b) => b.id === "immunity" && b.effect.singleUse
    );
    if (immunityBuff) {
      logToBattleLog(
        `✦효과✦ ${this.name}: [면역] 효과로 [${name}] 디버프를 무효화합니다.`
      );
      this.removeBuffById("immunity");
      return;
    }

    let existingDebuff = this.debuffs.find((d) => d.id === id);
    if (existingDebuff) {
      if (effect.overrideDuration) {
        existingDebuff.turnsLeft = turns;
      } else {
        existingDebuff.turnsLeft = Math.max(existingDebuff.turnsLeft, turns);
      }

      if (effect.maxStacks && existingDebuff.stacks !== undefined) {
        existingDebuff.stacks = Math.min(
          effect.maxStacks,
          (existingDebuff.stacks || 0) + 1
        );
      } else if (effect.maxStacks) {
        existingDebuff.stacks = 1;
      }
      existingDebuff.effect = { ...existingDebuff.effect, ...effect };
    } else {
      this.debuffs.push({
        id,
        name,
        turnsLeft: turns,
        effect,
        stacks: effect.maxStacks ? 1 : undefined,
      });
    }
  }

  // 서포터 전용 패시브 체크 함수
  checkSupporterPassive(logFn) {
    if (
      this.job === "서포터" &&
      this.currentHp <= this.maxHp * 0.4 &&
      this.supporterShieldCount < 3
    ) {
      let statToUse = "atk";
      if (this.type === "천체" || this.type === "나무") {
        statToUse = "matk";
      }
      const shieldAmount = Math.round(this.getEffectiveStat(statToUse) * 0.05);
      this.shield += shieldAmount;
      this.supporterShieldCount++;
      logFn(
        `✦직군 효과(서포터)✦ [절제된 응원] 발동. 보호막 ${shieldAmount}을 획득합니다. (남은 횟수: ${
          3 - this.supporterShieldCount
        })`
      );
    }
  }

  getDebuffStacks(id) {
    const debuff = this.debuffs.find((d) => d.id === id);
    return debuff && debuff.stacks !== undefined
      ? debuff.stacks
      : debuff
      ? 1
      : 0;
  }

  hasBuff(id) {
    return this.buffs.some((b) => b.id === id && b.turnsLeft > 0);
  }
  hasDebuff(id) {
    return this.debuffs.some((d) => d.id === id && d.turnsLeft > 0);
  }

  removeDebuffById(id) {
    const debuffIndex = this.debuffs.findIndex((d) => d.id === id);
    if (debuffIndex > -1) {
      this.debuffs.splice(debuffIndex, 1);
    }
  }

  removeBuffById(id) {
    const buffIndex = this.buffs.findIndex(
      (b) => b.id === id && !b.unremovable
    );
    if (buffIndex > -1) {
      const removedBuff = this.buffs[buffIndex];

      if (removedBuff.effect.shieldAmount) {
        this.shield = Math.max(
          0,
          this.shield - removedBuff.effect.shieldAmount
        );
        logToBattleLog(
          `✦효과 해제✦ ${this.name}: [${
            removedBuff.name
          }] 효과 종료, 보호막 -${removedBuff.effect.shieldAmount.toFixed(
            0
          )}. (현재 총 보호막: ${this.shield.toFixed(0)})`
        );
      }

      if (removedBuff.id === "will_buff" && removedBuff.effect.healOnRemove) {
        if (this.shield > 0) {
          const healAmount = this.shield;
          applyHeal(
            this,
            healAmount,
            logToBattleLog,
            `[${removedBuff.name}] 해제`
          );
          this.shield = 0;
        }
        if (removedBuff.effect.resetsTotalDamageTaken) {
          this.totalDamageTakenThisBattle = 0;
          logToBattleLog(
            `✦정보✦ ${this.name}: [${removedBuff.name}] 효과로 누적 받은 피해 총합이 초기화되었습니다.`
          );
        }
      }
      this.buffs.splice(buffIndex, 1);
    }
  }

  takeDamage(rawDamage, logFn, attacker = null, currentOpponentList = null) {
    if (!this.isAlive) return;

    // 공격자(attacker)가 있고, 그 공격자가 '아군' 캐릭터 목록에 포함되어 있다면
    if (attacker && allyCharacters.includes(attacker)) {
      // 그리고 실제 피해량이 0보다 크다면 (빗나감이나 무효가 아니라면)
      if (rawDamage > 0) {
        playerAttackCountThisTurn++; // 타수 카운터를 1 올림
        console.log(
          `[DEBUG] Player attack count updated: ${playerAttackCountThisTurn}`
        );
      }
    }

    if (this.isGimmickObject) {
      this.hp -= rawDamage;
      if (this.hp <= 0) {
        this.isAlive = false;
        logFn(`✦파괴✦ 기믹 오브젝트 [${this.name}] 파괴`);
        mapObjects = mapObjects.filter((obj) => obj.id !== this.id);
        const posKey = Object.keys(characterPositions).find(
          (key) => characterPositions[key] === this.id
        );
        if (posKey) delete characterPositions[posKey];
        displayCharacters();
      }
      return;
    }

    if (attacker && attacker.isAlive) {
      if (TYPE_RELATIONSHIPS[attacker.type] === this.type) {
        logFn(
          `✦상성 우위✦ ${attacker.name}의 공격(${attacker.type})이 ${this.name}(${this.type})에 적중합니다.`
        );
      } else if (TYPE_RELATIONSHIPS[this.type] === attacker.type) {
        logFn(
          `✦상성 열세✦ ${this.name}(${this.type}), ${attacker.name}의 공격(${attacker.type})에 저항합니다.`
        );
      }
    }

    if (this.isAlive && attacker && allyCharacters.includes(this)) {
      const ironFortressAlly = allyCharacters.find(
        (ally) =>
          ally.isAlive && ally.id !== this.id && ally.hasBuff("iron_fortress")
      );

      if (ironFortressAlly) {
        logFn(
          `✦피해 이전✦ ${this.name}의 받을 피해 ${rawDamage.toFixed(
            0
          )}가 [철옹성] 효과를 지닌 ${ironFortressAlly.name}에게 이전됩니다.`
        );
        ironFortressAlly.takeDamage(rawDamage, logFn, attacker);
        return;
      }
    }

    let finalDamage = rawDamage;
    const initialHp = this.currentHp;
    const prevIsAlive = this.isAlive;
    const shieldBeforeDamage = this.shield;

    const provokeReductionBuff = this.buffs.find(
      (b) => b.id === "provoke_damage_reduction" && b.turnsLeft > 0
    );
    if (provokeReductionBuff && provokeReductionBuff.effect.damageReduction) {
      finalDamage *= 1 - provokeReductionBuff.effect.damageReduction;
    }

    if (this.hasDebuff("nightmare")) {
      this.removeDebuffById("nightmare");
      logToBattleLog(`✦효과✦ ${this.name}, 공격을 받아 [악몽]에서 깨어납니다.`);
    }

    if (this.shield > 0) {
      const damageToShield = Math.min(finalDamage, this.shield);
      if (damageToShield > 0) {
        this.shield -= damageToShield;
        finalDamage -= damageToShield;
        logFn(
          `✦보호막✦ ${this.name}: 보호막으로 피해 ${damageToShield.toFixed(
            0
          )} 흡수. (남은 보호막: ${this.shield.toFixed(0)})`
        );
      }
    }

    // 서포터 직군 효과: 보호막 파괴 시
    if (this.job === "서포터" && shieldBeforeDamage > 0 && this.shield <= 0) {
      logFn(
        `✦직군 효과(서포터)✦ [절제된 응원]의 보호막이 사라져 주변 적의 방어력을 감소시킵니다!`
      );
      const adjacentEnemies = findAdjacentEnemies(this);
      if (adjacentEnemies.length > 0) {
        adjacentEnemies.forEach((enemy) => {
          enemy.addDebuff("supporter_def_shred", "방어력 감소", 1, {
            type: "def_boost_multiplier",
            value: 0.95,
            category: "속성 감소",
          });
          logFn(`  ✦디버프✦ ${enemy.name}: 방어력이 1턴간 5% 감소합니다.`);
        });
      } else {
        logFn(`  ✦정보✦ 주변에 적이 없어 효과가 발동되지 않았습니다.`);
      }
    }

    const hpLossBeforeDeath = this.currentHp;
    this.currentHp -= finalDamage;
    const actualHpLoss = hpLossBeforeDeath - Math.max(0, this.currentHp);

    // B-2 보스 '카르나블룸'에게만 적용되는 로직
    if (this.name === "카르나블룸" && this.type === "천체") {
      const currentHpPercent = (this.currentHp / this.maxHp) * 100;
      // HP 50% 이하, 맵 축소가 아직 0단계일 때
      if (currentHpPercent <= 50 && mapShrinkState === 0) {
        mapShrinkState = 1; // 1단계로 변경 (7x7)
        logToBattleLog(
          `✦기믹 발동✦ ${GIMMICK_DATA["GIMMICK_The_Final_Curtain1"].script}`
        );
      }
      // HP 20% 이하, 맵 축소가 아직 1단계일 때
      if (currentHpPercent <= 20 && mapShrinkState === 1) {
        mapShrinkState = 2; // 2단계로 변경 (5x5)
        logToBattleLog(
          `✦기믹 발동✦ ${GIMMICK_DATA["GIMMICK_The_Final_Curtain2"].script}`
        );
      }
    }

    if (actualHpLoss > 0) {
      this.currentTurnDamageTaken += actualHpLoss;
      this.totalDamageTakenThisBattle += actualHpLoss;
      if (this.hasBuff("provoke_active")) {
        this.aggroDamageStored += actualHpLoss;
      }
    }
    this.lastAttackedBy = attacker ? attacker.id : null;

    if (
      activeGimmickState &&
      activeGimmickState.type.startsWith("clown_emotion") &&
      actualHpLoss > 0
    ) {
      if (this.name === "클라운") {
        activeGimmickState.clownHits++;
        const emotionType =
          activeGimmickState.type === "clown_emotion_laugh" ? "웃음" : "눈물";
        console.log(
          `[DEBUG] takeDamage: 광대의 감정(${emotionType}) 기믹 활성 중. 피격자: ${this.name}`
        );
        logFn(
          `✦기믹✦ [광대의 ${emotionType}] 활성 중. 클라운 유효타 +1 (현재: ${activeGimmickState.clownHits})`
        );
      } else if (this.name === "피에로") {
        activeGimmickState.pierrotHits++;
        const emotionType =
          activeGimmickState.type === "clown_emotion_laugh" ? "웃음" : "눈물";
        logFn(
          `✦기믹✦ [광대의 ${emotionType}] 활성 중. 피에로 유효타 +1 (현재: ${activeGimmickState.pierrotHits})`
        );
      }
    }

    if (attacker && attacker.isAlive && actualHpLoss > 0) {
      const alliesOfAttacked = allyCharacters.includes(this)
        ? allyCharacters
        : enemyCharacters;
      const enemiesOfAttacked = allyCharacters.includes(this)
        ? enemyCharacters
        : allyCharacters;

      if (this.hasBuff("riposte_stance")) {
        let highestHpEnemies = [];
        let maxHp = -1;
        enemiesOfAttacked
          .filter((e) => e.isAlive)
          .forEach((enemy) => {
            if (enemy.currentHp > maxHp) {
              maxHp = enemy.currentHp;
              highestHpEnemies = [enemy];
            } else if (enemy.currentHp === maxHp) {
              highestHpEnemies.push(enemy);
            }
          });
        if (highestHpEnemies.length > 0) {
          const targetEnemy =
            highestHpEnemies.length === 1
              ? highestHpEnemies[0]
              : highestHpEnemies[
                  Math.floor(Math.random() * highestHpEnemies.length)
                ];
          const counterDmg = Math.round(actualHpLoss * 1.5);
          logFn(
            `✦반격✦ ${this.name} ([응수]), ${targetEnemy.name}에게 ${counterDmg} 피해.`
          );
          targetEnemy.takeDamage(counterDmg, logFn, this);
        }
      } else if (this.hasBuff("fury_stance")) {
        const counterDmg = Math.round(actualHpLoss * 1.5);
        enemiesOfAttacked
          .filter((e) => e.isAlive)
          .forEach((enemy) => {
            logFn(
              `✦반격✦ ${this.name} ([격노]), ${enemy.name}에게 ${counterDmg} 피해.`
            );
            enemy.takeDamage(counterDmg, logFn, this);
          });
      }

      alliesOfAttacked.forEach((allyCaster) => {
        if (allyCaster.isAlive && allyCaster.id !== this.id) {
          if (allyCaster.hasBuff("riposte_stance")) {
            let lowestHpEnemies = [];
            let minHp = Infinity;
            enemiesOfAttacked
              .filter((e) => e.isAlive)
              .forEach((enemy) => {
                if (enemy.currentHp < minHp) {
                  minHp = enemy.currentHp;
                  lowestHpEnemies = [enemy];
                } else if (enemy.currentHp === minHp) {
                  lowestHpEnemies.push(enemy);
                }
              });
            if (lowestHpEnemies.length > 0) {
              const targetEnemy =
                lowestHpEnemies.length === 1
                  ? lowestHpEnemies[0]
                  : lowestHpEnemies[
                      Math.floor(Math.random() * lowestHpEnemies.length)
                    ];
              const counterDmg = Math.round(actualHpLoss * 0.5);
              logFn(
                `✦반격✦ ${allyCaster.name} ([응수] 발동, ${this.name} 피격), ${targetEnemy.name}에게 ${counterDmg} 피해.`
              );
              targetEnemy.takeDamage(counterDmg, logFn, allyCaster);
            }
          } else if (allyCaster.hasBuff("fury_stance")) {
            const counterDmg = Math.round(actualHpLoss * 0.5);
            enemiesOfAttacked
              .filter((e) => e.isAlive)
              .forEach((enemy) => {
                logFn(
                  `✦반격✦ ${allyCaster.name} ([격노] 발동, ${this.name} 피격), ${enemy.name}에게 ${counterDmg} 피해.`
                );
                enemy.takeDamage(counterDmg, logFn, allyCaster);
              });
          }
        }
      });

      if (this.hasBuff("reversal_active")) {
        const storedDamage = this.aggroDamageStored || 0;
        let reversalDamage = 0;
        let reversalDamageType = "";
        let reversalDamageTypeKr = "";

        if (currentTurn % 2 !== 0) {
          reversalDamage = (this.getEffectiveStat("atk") + storedDamage) * 1.5;
          reversalDamageType = "physical";
          reversalDamageTypeKr = "물리";
        } else {
          reversalDamage = (this.getEffectiveStat("matk") + storedDamage) * 1.5;
          reversalDamageType = "magical";
          reversalDamageTypeKr = "마법";
        }

        reversalDamage = Math.round(reversalDamage);
        if (reversalDamage > 0) {
          logFn(
            `✦스킬✦ ${
              this.name
            } ([역습] 발동, [도발] 저장 피해: ${storedDamage.toFixed(0)}): ${
              attacker.name
            }에게 ${reversalDamage} ${reversalDamageTypeKr} 피해.`
          );
          attacker.takeDamage(reversalDamage, logFn, this);
        }
        this.aggroDamageStored = 0;
        this.removeBuffById("reversal_active");
      }
    }

    const reflectBuff = this.buffs.find(
      (b) => b.effect.type === "damage_reflect" && b.turnsLeft > 0
    );
    if (reflectBuff && attacker && attacker.isAlive && actualHpLoss > 0) {
      const reflectedDamage = actualHpLoss * reflectBuff.effect.value;
      if (reflectedDamage > 0) {
        logFn(
          `✦피해 반사✦ ${this.name} [${reflectBuff.name} 효과]: ${
            attacker.name
          }에게 ${reflectedDamage.toFixed(0)} 피해 반사.`
        );
        attacker.takeDamage(reflectedDamage, logFn, this);
      }
    }

    const transferDebuff = this.debuffs.find(
      (d) => d.id === "transfer" && d.turnsLeft > 0
    );
    if (transferDebuff && attacker && attacker.isAlive) {
      const healToAttacker = this.getEffectiveStat("atk");
      applyHeal(attacker, healToAttacker, logFn, `[전이] 디버프`);
    }

    const traceBuff = this.buffs.find(
      (b) => b.id === "trace" && b.turnsLeft > 0
    );
    if (traceBuff && this.isAlive && this.currentHp <= this.maxHp * 0.5) {
      const originalCaster = findCharacterById(
        traceBuff.effect.originalCasterId
      );
      if (originalCaster && originalCaster.isAlive) {
        const hpCostForCaster = originalCaster.maxHp * 0.05;
        const healForTarget = this.maxHp * 0.25;

        originalCaster.currentHp -= hpCostForCaster;
        logFn(
          `✦효과✦ ${this.name}의 [흔적] 버프로 인해, ${
            originalCaster.name
          }의 체력이 ${hpCostForCaster.toFixed(0)} 감소합니다.`
        );
        if (originalCaster.currentHp <= 0) {
          originalCaster.currentHp = 0;
          originalCaster.isAlive = false;
          logFn(
            `✦전투 불능✦ ${originalCaster.name}, [흔적]의 대가로 쓰러집니다.`
          );
        }

        applyHeal(this, healForTarget, logFn, `[흔적] 버프`);
      }
    }

    if (this.currentHp <= 0) {
      this.currentHp = 0;

      // B-1 보스 '카르나블룸'이고, '커튼콜' 기믹이 발동될 수 있다면
      if (this.name === "카르나블룸" && this.type === "야수") {
        const livingMinions = enemyCharacters.filter(
          (e) => e.isAlive && (e.name === "클라운" || e.name === "피에로")
        );

        if (livingMinions.length > 0) {
          logToBattleLog(
            '✦기믹✦ [커튼콜]: "나의 아이들은 아직 무대를 떠날 준비가 되지 않은 모양이야."'
          );

          let totalHeal = 0;
          livingMinions.forEach((minion) => {
            const hpSacrifice = Math.round(minion.maxHp * 0.1);
            minion.takeDamage(hpSacrifice, logToBattleLog, null); // 쫄병 체력 10% 소모
            totalHeal += hpSacrifice;
            logToBattleLog(
              ` ↪︎ ${minion.name}, 체력 ${hpSacrifice}을 바쳐 보스를 부활시킵니다.`
            );
          });

          this.currentHp = totalHeal; // 희생된 체력만큼 보스 부활
          logToBattleLog(
            `✦부활✦ 카르나블룸이 체력 ${totalHeal}을 회복하고 다시 일어섭니다.`
          );

          // 여기서 return하여 아래의 사망 로직을 타지 않게 함
          return;
        }
      }

      if (prevIsAlive) {
        logFn(`✦전투 불능✦ ${this.name}, 쓰러집니다.`);
      }
      this.isAlive = false;
    }
    logFn(
      `✦정보✦ ${this.name} HP: ${initialHp.toFixed(
        0
      )} → ${this.currentHp.toFixed(0)} (보호막: ${this.shield.toFixed(0)})`
    );
  }

  getEffectiveStat(statName) {
    let value = this[statName];

    const melancholyDebuff = this.debuffs.find(
      (d) => d.id === "melancholy_brand"
    );
    const ecstasyDebuff = this.debuffs.find((d) => d.id === "ecstasy_brand");

    if (ecstasyDebuff) {
      // [환희 낙인] 효과
      if (statName === "atk" || statName === "matk") {
        value *= 1.1; // 공격력/마법 공격력 10% 증폭
      }
      if (statName === "def" || statName === "mdef") {
        value *= 0.8; // 방어력/마법 방어력 20% 감소
      }
    }
    if (melancholyDebuff) {
      // [우울 낙인] 효과
      if (statName === "atk" || statName === "matk") {
        value *= 0.9; // 공격력/마법 공격력 10% 감소
      }
    }

    this.buffs.forEach((buff) => {
      if (buff.turnsLeft > 0 && buff.effect) {
        if (buff.effect.type === `${statName}_boost_multiplier`) {
          value *= buff.effect.value;
        }
        if (buff.effect.type === `${statName}_boost_flat`) {
          value += buff.effect.value;
        }

        if (buff.id === 'reality_stacks' && buff.effect.stacks > 0) {
            // 기획: 모든 아군 스탯 합산의 20% * 스택 수만큼 증가
            const totalBoost = buff.effect.boostValuePerStack * buff.effect.stacks;
            
            if (statName === 'atk' || statName === 'matk') {
                value += totalBoost;
            }
        }
      }
    });

    this.debuffs.forEach((debuff) => {
      if (debuff.turnsLeft > 0 && debuff.effect) {
        // 흠집으로 인한 방어력/마법방어력 감소
        if (
          debuff.id === "scratch" &&
          debuff.effect.reductionType === statName &&
          debuff.stacks > 0
        ) {
          const reductionPerStack = debuff.effect.reductionValue || 0.1;
          value *= 1 - reductionPerStack * debuff.stacks;
        }

        // 서포터로 인한 방어력 감소
        if (
          debuff.id === "supporter_def_shred" &&
          statName === "def" &&
          debuff.effect.type === "def_boost_multiplier"
        ) {
          value *= debuff.effect.value;
        }

        // [붕괴] 디버프
        if (debuff.id === "rupture_debuff") {
          if (statName === "def" && debuff.effect.defReduction) {
            value *= 1 - debuff.effect.defReduction;
          }
          if (statName === "mdef" && debuff.effect.mdefReduction) {
            value *= 1 - debuff.effect.mdefReduction;
          }
        }
      }
    });
    return Math.max(0, value);
  }
}

function resolveDressRehearsalMission() {
  if (!activeMission) return; // 이번 턴에 부여된 미션이 없으면 종료

  let missionSuccess = false;
  const missionTarget = findCharacterById(activeMission.targetCharId);

  // 미션 대상이 살아있는지 확인
  if (!missionTarget || !missionTarget.isAlive) {
    missionSuccess = false; // 대상이 죽었으면 미션은 자동 실패
  } else {
    // 플레이어들이 이번 턴에 '확정한' 행동 목록(playerActionsQueue)을 확인
    const targetAction = playerActionsQueue.find(
      (a) => a.caster.id === activeMission.targetCharId
    );

    switch (activeMission.type) {
      case "attack": // 공격 미션
        if (
          targetAction &&
          targetAction.type === "skill" &&
          targetAction.skill.type.includes("공격")
        ) {
          missionSuccess = true;
        }
        break;
      case "support": // 공격 외 스킬 미션
        if (
          targetAction &&
          targetAction.type === "skill" &&
          !targetAction.skill.type.includes("공격")
        ) {
          missionSuccess = true;
        }
        break;
      case "move": // 이동 미션
        if (targetAction && targetAction.type === "move") {
          missionSuccess = true;
        }
        break;
      case "skip": // 행동 포기 미션 (아무 행동도 확정하지 않았거나, '행동 포기'를 선택)
        if (!targetAction || targetAction.type === "skip") {
          missionSuccess = true;
        }
        break;
    }
  }

  // 최종 결과 판정
  if (missionSuccess) {
    logToBattleLog(
      `✦미션 성공✦ ${missionTarget.name}, [최종 리허설]의 배역을 완벽하게 소화했습니다.`
    );
  } else {
    logToBattleLog(
      `✦미션 실패✦ ${
        missionTarget ? missionTarget.name : "대상"
      }, 배역을 소화하지 못해 페널티를 받습니다.`
    );
    // 페널티 부여
    switch (activeMission.type) {
      case "attack":
        if (missionTarget)
          missionTarget.addDebuff("stun", "[이동 불가]", 3, {
            category: "제어",
          });
        break;
      case "support":
        if (missionTarget)
          missionTarget.addDebuff("melancholy_brand", "[우울 낙인]", 99, {
            unremovable: false,
          });
        break;
      case "move":
        if (missionTarget)
          missionTarget.addDebuff("ecstasy_brand", "[환희 낙인]", 99, {
            unremovable: false,
          });
        break;
      case "skip":
        allyCharacters
          .filter((a) => a.isAlive)
          .forEach((ally) => {
            const damage = Math.round(ally.maxHp * 0.1);
            ally.takeDamage(damage, logToBattleLog, null);
          });
        break;
    }
  }

  activeMission = null; // 다음 턴을 위해 미션 초기화
}

// --- 3. 유틸리티 및 UI 관리 함수 ---
function logToBattleLog(message) {
  if (battleLogDiv) {
    const trimmedmessage =
      typeof message === "string" ? message.trim() : message;
    battleLogDiv.innerHTML += trimmedmessage + "<br>";
    battleLogDiv.scrollTop = battleLogDiv.scrollHeight;
  } else {
    console.error("battleLogDiv is not defined.");
  }

  updatePlayerView();
}

function getRandomEmptyCell() {
  const occupiedCells = new Set(Object.keys(characterPositions));
  const emptyCells = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (!occupiedCells.has(`${x},${y}`)) {
        emptyCells.push({ x, y });
      }
    }
  }
  if (emptyCells.length === 0) return null;
  return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

function addCharacter(team) {
  const nameInput = getElement("charName");
  const typeInput = getElement("charType");
  const jobInput = getElement("charJob");
  const hpInput = getElement("charCurrentHp");

  const name =
    nameInput.value.trim() ||
    (team === "ally"
      ? `아군${allyCharacters.length + 1}`
      : `적군${enemyCharacters.length + 1}`);
  const type = typeInput.value;
  const job = jobInput.value;
  let currentHp = hpInput.value.trim() === "" ? null : parseInt(hpInput.value);

  if (!name) {
    alert("캐릭터 이름을 입력해 주세요.");
    nameInput.focus();
    return;
  }
  if (currentHp !== null && (isNaN(currentHp) || currentHp <= 0)) {
    alert("유효한 현재 체력을 입력하거나 비워 두세요.");
    hpInput.focus();
    return;
  }

  const newChar = new Character(name, type, job, currentHp);
  const cell = getRandomEmptyCell();
  if (cell) {
    newChar.posX = cell.x;
    newChar.posY = cell.y;
    characterPositions[`${cell.x},${cell.y}`] = newChar.id;
  } else {
    logToBattleLog(`✦경고✦: ${name}을(를) 배치할 빈 공간이 맵에 없습니다.`);
  }

  if (team === "ally") {
    allyCharacters.push(newChar);
    logToBattleLog(
      `✦합류✦ 아군 [${name}, ${type}, ${job}] (HP: ${newChar.currentHp}/${newChar.maxHp}), [${newChar.posX},${newChar.posY}].`
    );
  } else if (team === "enemy") {
    enemyCharacters.push(newChar);
    logToBattleLog(
      `✦합류✦ 적군 [${name}, ${type}] (HP: ${newChar.currentHp}/${newChar.maxHp}), [${newChar.posX},${newChar.posY}].`
    );
  }
  nameInput.value = "";
  hpInput.value = "";

  displayCharacters();
}

function deleteCharacter(characterId, team) {
  let targetArray = team === "ally" ? allyCharacters : enemyCharacters;
  const charIndex = targetArray.findIndex((char) => char.id === characterId);

  if (charIndex > -1) {
    const charToRemove = targetArray[charIndex];
    if (charToRemove.posX !== -1 && charToRemove.posY !== -1) {
      delete characterPositions[`${charToRemove.posX},${charToRemove.posY}`];
    }
    targetArray.splice(charIndex, 1);
    logToBattleLog(
      `🗑️ ${team === "ally" ? "아군" : "적군"} [${charToRemove.name}] 제외됨.`
    );
  }
  displayCharacters();
}

function createCharacterCard(character, team) {
  const card = document.createElement("div");
  card.className = "character-stats";

  if (
    selectedAction.targetId === character.id ||
    (selectedAction.type === "skill" &&
      SKILLS[selectedAction.skillId]?.targetSelection === "two_enemies" &&
      selectedAction.subTargetId === character.id)
  ) {
    card.classList.add("selected");
  }

  // 아군일 경우에만 직군 표시
  const jobDisplay = team === "ally" ? ` (${character.job})` : "";

  card.innerHTML = `
        <p><strong>${character.name} (${
    character.type
  })${jobDisplay}</strong> ${
    character.posX !== -1 ? `[${character.posX},${character.posY}]` : ""
  }</p>
        <p>HP: ${character.currentHp.toFixed(0)} / ${character.maxHp.toFixed(
    0
  )} ${character.shield > 0 ? `(+${character.shield.toFixed(0)}🛡️)` : ""}</p>
        <p>공격력: ${character
          .getEffectiveStat("atk")
          .toFixed(0)} | 마법 공격력: ${character
    .getEffectiveStat("matk")
    .toFixed(0)}</p>
        <p>방어력: ${character
          .getEffectiveStat("def")
          .toFixed(0)} | 마법 방어력: ${character
    .getEffectiveStat("mdef")
    .toFixed(0)}</p>
        <p>상태: ${
          character.isAlive ? "생존" : '<span style="color:red;">쓰러짐</span>'
        }</p>
        ${
          character.buffs.length > 0
            ? `<p>버프: ${character.buffs
                .map(
                  (b) =>
                    `${b.name}(${b.turnsLeft}턴${
                      b.stacks > 1 ? `x${b.stacks}` : ""
                    })`
                )
                .join(", ")}</p>`
            : ""
        }
        ${
          character.debuffs.length > 0
            ? `<p>디버프: ${character.debuffs
                .map(
                  (d) =>
                    `${d.name}(${d.turnsLeft}턴${
                      d.stacks > 1 ? `x${d.stacks}` : ""
                    })`
                )
                .join(", ")}</p>`
            : ""
        }
        ${
          isBattleStarted
            ? ""
            : `<button class="delete-char-button" onclick="deleteCharacter('${character.id}', '${team}')">X</button>`
        }
    `;

  card.onclick = (event) => {
    if (event.target.classList.contains("delete-char-button")) return;
    if (
      isBattleStarted &&
      skillSelectionArea.style.display !== "none" &&
      selectedAction.type === "skill"
    ) {
      selectTarget(character.id);
    }
  };
  return card;
}

function loadSelectedMap() {
  if (isBattleStarted) {
    alert("전투 중에는 맵을 변경할 수 없습니다.");
    return;
  }
  const mapSelect = getElement("mapSelect");
  const selectedMapId = mapSelect.value;
  loadMap(selectedMapId);
}

function loadMap(mapId) {
  console.log(`[DEBUG] loadMap: 맵 [${mapId}] 불러오기 시작.`);
  currentMapId = mapId;
  const mapConfig = MAP_CONFIGS[mapId];
  if (!mapConfig) {
    console.error(
      `[DEBUG] loadMap: 맵 설정 [${mapId}]을(를) 찾을 수 없습니다.`
    );
    return;
  }

  MAP_WIDTH = mapConfig.width || 5;
  MAP_HEIGHT = mapConfig.height || 5;
  console.log(
    `[DEBUG] loadMap: 맵 크기 ${MAP_WIDTH}x${MAP_HEIGHT}(으)로 설정됨.`
  );
  logToBattleLog(
    `✦정보✦ 맵 크기가 ${MAP_WIDTH}x${MAP_HEIGHT}(으)로 설정되었습니다.`
  );

  if (mapConfig.flavorText) {
    logToBattleLog(`\n<pre>${mapConfig.flavorText}</pre>\n`);
  } else {
    logToBattleLog(`--- 맵 [${mapConfig.name}]을(를) 불러옵니다. ---`);
  }

  enemyCharacters = [];
  console.log("[DEBUG] loadMap: 적군 목록 초기화 완료.");

  // 모든 몬스터를 mapConfig 기반으로 소환
  mapConfig.enemies.forEach((mapEnemy) =>
    summonMonsterAt(mapEnemy.templateId, mapEnemy.pos)
  );

  // 중복 소환 로직 제거
  /*
    // B-1, B-2 맵 전용 초기 배치 (광대 2, 피에로 2)
    if (mapId === 'B-1' || mapId === 'B-2') {
        console.log(`[DEBUG] loadMap: 맵 ${mapId} 전용 초기 배치 실행.`);
        
        summonMonsterAt("Clown", {x: 1, y: 1});
        summonMonsterAt("Clown", {x: 7, y: 7});
        summonMonsterAt("Pierrot", {x: 7, y: 1});
        summonMonsterAt("Pierrot", {x: 1, y: 7});
    }
    */
  // --- 수정된 부분 끝 ---

  // 모든 캐릭터의 위치 정보 최종 정리
  characterPositions = {};
  [...allyCharacters, ...enemyCharacters].forEach((char) => {
    if (char.isAlive && char.posX !== -1 && char.posY !== -1) {
      characterPositions[`${char.posX},${char.posY}`] = char.id;
    }
  });

  displayCharacters();
}

function summonMonster(monsterTemplateId) {
  const template = MONSTER_TEMPLATES[monsterTemplateId];
  if (!template) {
    logToBattleLog(
      `\n✦경고✦: 소환할 몬스터 템플릿 [${monsterTemplateId}]를 찾을 수 없습니다.`
    );
    return;
  }

  const spawnPoints = SPAWN_POINTS[monsterTemplateId];
  if (!spawnPoints || spawnPoints.length === 0) {
    logToBattleLog(
      `\n✦경고✦: [${monsterTemplateId}]의 스폰 지점 정보가 없습니다.`
    );
    return;
  }

  let spawnPos = null;
  for (const pos of spawnPoints) {
    if (!characterPositions[`${pos.x},${pos.y}`]) {
      spawnPos = pos;
      break;
    }
  }

  if (spawnPos === null) {
    logToBattleLog(
      `\n✦정보✦: [${template.name}]을(를) 소환할 비어 있는 스폰 지점이 없습니다.`
    );
    return;
  }

  let monsterType;
  if (Array.isArray(template.type)) {
    monsterType =
      template.type[Math.floor(Math.random() * template.type.length)];
  } else {
    monsterType = template.type;
  }

  const newEnemy = new Character(template.name, monsterType, null); // 몬스터는 직군이 없음

  newEnemy.maxHp = template.maxHp || 100;
  newEnemy.currentHp = newEnemy.maxHp;
  newEnemy.atk = template.atk || 15;
  newEnemy.matk = template.matk || 15;
  newEnemy.def = template.def || 15;
  newEnemy.mdef = template.mdef || 15;
  newEnemy.skills = template.skills ? [...template.skills] : [];
  newEnemy.gimmicks = template.gimmicks ? [...template.gimmicks] : [];

  newEnemy.posX = spawnPos.x;
  newEnemy.posY = spawnPos.y;

  enemyCharacters.push(newEnemy);
  characterPositions[`${spawnPos.x},${spawnPos.y}`] = newEnemy.id;

  logToBattleLog(
    `\n✦소환✦ 추가 적군 [${newEnemy.name}], [${spawnPos.x},${spawnPos.y}] 출현.`
  );
  displayCharacters();
}

function summonMonsterAt(monsterTemplateId, position) {
  if (
    position.x < 0 ||
    position.x >= MAP_WIDTH ||
    position.y < 0 ||
    position.y >= MAP_HEIGHT
  ) {
    logToBattleLog(
      `✦정보✦ 소환 지점(${position.x},${position.y})이 맵 범위를 벗어납니다.`
    );
    return;
  }
  const posKey = `${position.x},${position.y}`;
  if (characterPositions[posKey]) {
    logToBattleLog(
      `✦정보✦ 소환 지점(${position.x},${position.y})이 막혀있어 ${monsterTemplateId} 소환에 실패했습니다.`
    );
    return;
  }

  const template = MONSTER_TEMPLATES[monsterTemplateId];
  if (!template) {
    logToBattleLog(
      `✦경고✦: 소환할 몬스터 템플릿 [${monsterTemplateId}]를 찾을 수 없습니다.`
    );
    return;
  }

  let monsterType = Array.isArray(template.type)
    ? template.type[Math.floor(Math.random() * template.type.length)]
    : template.type;

  const newEnemy = new Character(template.name, monsterType, null); // 몬스터는 직군 없음

  newEnemy.maxHp = template.maxHp || 100;
  newEnemy.currentHp = newEnemy.maxHp;
  newEnemy.atk = template.atk || 15;
  newEnemy.matk = template.matk || 15;
  newEnemy.def = template.def || 15;
  newEnemy.mdef = template.mdef || 15;
  newEnemy.skills = template.skills ? [...template.skills] : [];
  newEnemy.gimmicks = template.gimmicks ? [...template.gimmicks] : [];

  newEnemy.posX = position.x;
  newEnemy.posY = position.y;

  enemyCharacters.push(newEnemy);
  characterPositions[posKey] = newEnemy.id;

  logToBattleLog(
    `✦소환✦ 추가 적군 [${newEnemy.name}], [${position.x},${position.y}]에 출현.`
  );
}

function displayCharacters() {
  const allyDisplay = getElement("allyCharacters");
  const enemyDisplay = getElement("enemyCharacters");
  allyDisplay.innerHTML =
    allyCharacters.length === 0 ? "<p>아군 캐릭터가 없습니다.</p>" : "";
  allyCharacters.forEach((char) =>
    allyDisplay.appendChild(createCharacterCard(char, "ally"))
  );
  enemyDisplay.innerHTML =
    enemyCharacters.length === 0 ? "<p>적군 캐릭터가 없습니다.</p>" : "";
  enemyCharacters.forEach((char) =>
    enemyDisplay.appendChild(createCharacterCard(char, "enemy"))
  );

  if (typeof renderMapGrid === "function") {
    const activeAreaEffects = enemyCharacters
      .filter((e) => e.isAlive && e.areaEffect)
      .map((e) => e.areaEffect);

    const previewedHitArea = enemyPreviewAction
      ? enemyPreviewAction.hitArea
      : [];
    const previewedSkillId = enemyPreviewAction
      ? enemyPreviewAction.skillId
      : null;
    renderMapGrid(
      mapGridContainer,
      allyCharacters,
      enemyCharacters,
      mapObjects,
      activeAreaEffects,
      previewedHitArea,
      previewedSkillId,
      MAP_WIDTH,
      MAP_HEIGHT
    );
  }

  updatePlayerView();
}

// --- 4. 핵심 전투 로직 함수 ---
function calculateDamage(
  attacker,
  defender,
  skillPower,
  damageType,
  statTypeToUse = null
) {
  let typeModifier = 1.0;

  // [우울 낙인] 디버프가 없을 때만 상성 우위 적용
  if (
    !attacker.hasDebuff("melancholy_brand") &&
    TYPE_RELATIONSHIPS[attacker.type] === defender.type
  ) {
    typeModifier = TYPE_ADVANTAGE_MODIFIER;
  } else if (TYPE_RELATIONSHIPS[defender.type] === attacker.type) {
    typeModifier = TYPE_DISADVANTAGE_MODIFIER;
  }

  if (
    defender.activeGimmick &&
    defender.activeGimmick.startsWith("GIMMICK_Aegis_of_Earth")
  ) {
    const gimmickData = GIMMICK_DATA[defender.activeGimmick];
    if (gimmickData) {
      const safeZone = gimmickData.coords.split(";").map((s) => {
        const [x, y] = s.split(",").map(Number);
        return { x, y };
      });

      const isAttackerInSafeZone = safeZone.some(
        (pos) => pos.x === attacker.posX && pos.y === attacker.posY
      );

      if (isAttackerInSafeZone) {
        logToBattleLog(
          `\n✦기믹 효과✦ ${attacker.name}, [${gimmickData.name}]의 영역 안에서 공격하여 피해량이 1.5배 증가합니다.`
        );
        skillPower *= 1.5;
      } else {
        logToBattleLog(
          `\n✦기믹 효과✦ ${attacker.name}, [${gimmickData.name}]의 영역 밖에서 공격하여 피해가 무시됩니다.`
        );
        return 0;
      }
    }
  }

  let baseAttackStat = 0;
  let defenseStat = 0;
  let actualSkillPower = skillPower;

  const attackerWeakness = attacker.debuffs.find(
    (d) => d.id === "weakness" && d.turnsLeft > 0
  );
  if (attackerWeakness && attackerWeakness.effect.damageMultiplierReduction) {
    actualSkillPower *= 1 - attackerWeakness.effect.damageMultiplierReduction;
  }

  if (damageType === "physical") {
    baseAttackStat = attacker.getEffectiveStat(statTypeToUse || "atk");
    defenseStat = defender.getEffectiveStat("def");
  } else if (damageType === "magical") {
    baseAttackStat = attacker.getEffectiveStat(statTypeToUse || "matk");
    defenseStat = defender.getEffectiveStat("mdef");
  } else if (damageType === "fixed") {
    return Math.round(Math.max(0, skillPower));
  } else {
    return 0;
  }

  // 방어하는 쪽(defender)이 'groggy' 상태라면, 최종 데미지를 10% 증가시킴
  if (defender.hasDebuff("groggy")) {
    let finalDamage =
      baseAttackStat * actualSkillPower * typeModifier - defenseStat;
    finalDamage = Math.max(0, finalDamage);
    // 여기에 추가 피해를 더함
    const bonusDamage = finalDamage * 0.1;
    return Math.round(finalDamage + bonusDamage);
  }

  let damage = baseAttackStat * actualSkillPower * typeModifier - defenseStat;

  return Math.round(Math.max(0, damage));
}

function applyTurnStartEffects(character) {
  character.currentTurnDamageTaken = 0;

  const newBuffs = [];
  for (const buff of character.buffs) {
    let keepBuff = true;
    if (buff.effect.type === "turn_start_heal" && buff.turnsLeft > 0) {
      const healAmount = buff.effect.value;
      applyHeal(character, healAmount, logToBattleLog, `[${buff.name} 효과]`);
    }

    if (!buff.unremovable) {
      buff.turnsLeft--;
    }

    if (buff.turnsLeft <= 0 && !buff.unremovable) {
      if (buff.effect.shieldAmount) {
        character.shield = Math.max(
          0,
          character.shield - buff.effect.shieldAmount
        );
        logToBattleLog(
          `✦효과 만료✦ ${character.name}: [${
            buff.name
          }] 효과 만료, 보호막 -${buff.effect.shieldAmount.toFixed(
            0
          )}. (현재 총 보호막: ${character.shield.toFixed(0)})`
        );
      }

      if (buff.id === "will_buff" && buff.effect.healOnRemove) {
        if (character.shield > 0) {
          const healAmount = character.shield;
          applyHeal(
            character,
            healAmount,
            logToBattleLog,
            `[${buff.name}] 만료`
          );
          character.shield = 0;
        }
        if (buff.effect.resetsTotalDamageTaken) {
          character.totalDamageTakenThisBattle = 0;
          logToBattleLog(
            `✦정보✦ ${character.name}: [${buff.name}] 효과로 누적 받은 피해 총합이 초기화되었습니다.`
          );
        }
      }
      keepBuff = false;
    }
    if (keepBuff) {
      newBuffs.push(buff);
    }
  }
  character.buffs = newBuffs;

  character.debuffs = character.debuffs.filter((debuff) => {
    if (
      debuff.id === "poison_truth" &&
      debuff.turnsLeft > 0 &&
      debuff.effect.type === "fixed"
    ) {
      const poisonDamage = debuff.effect.damagePerTurn;
      const roundedDamage = Math.round(poisonDamage);
      logToBattleLog(
        `✦상태 피해✦ ${character.name}, [${debuff.name} 효과]: ${roundedDamage} 고정 피해.`
      );
      character.takeDamage(
        roundedDamage,
        logToBattleLog,
        findCharacterById(debuff.effect.casterId) || null
      );
    }

    // 서포터로 인한 방어력 감소 디버프 턴 감소 처리 (이미 1턴짜리라 턴 시작 시 사라짐)
    if (debuff.id === "supporter_def_shred") {
      debuff.turnsLeft = 0;
    }

    debuff.turnsLeft--;
    return debuff.turnsLeft > 0;
  });
}

function processEndOfTurnEffects(actingChar) {
  const illusionBuff = actingChar.buffs.find(
    (b) => b.id === "illusion_end_turn_attack" && b.turnsLeft > 0
  );
  if (illusionBuff && illusionBuff.effect) {
    const casterOfIllusion = findCharacterById(illusionBuff.effect.attackerId);
    const enemyTargetForIllusion = findCharacterById(
      illusionBuff.effect.enemyTargetId
    );
    if (
      casterOfIllusion &&
      enemyTargetForIllusion &&
      enemyTargetForIllusion.isAlive
    ) {
      const illusionDamage = calculateDamage(
        casterOfIllusion,
        enemyTargetForIllusion,
        illusionBuff.effect.power,
        illusionBuff.effect.damageType || "physical"
      );
      logToBattleLog(
        `✦추가 공격✦ ${casterOfIllusion.name} [허상 턴 종료]: ${
          enemyTargetForIllusion.name
        }에게 ${illusionDamage.toFixed(0)} 추가 ${
          illusionBuff.effect.damageType === "magical" ? "마법" : "물리"
        } 피해.`
      );
      enemyTargetForIllusion.takeDamage(
        illusionDamage,
        logToBattleLog,
        casterOfIllusion
      );
    }
    actingChar.removeBuffById("illusion_end_turn_attack");
  }

  const truthBuff = actingChar.buffs.find(
    (b) => b.id === "truth_end_turn_attack_marker" && b.turnsLeft > 0
  );
  if (truthBuff && truthBuff.effect) {
    const casterOfTruth = findCharacterById(truthBuff.effect.originalCasterId);
    const aliveEnemiesForTruth = enemyCharacters.filter((e) => e.isAlive);
    if (casterOfTruth && aliveEnemiesForTruth.length > 0) {
      const randomEnemyTarget =
        aliveEnemiesForTruth[
          Math.floor(Math.random() * aliveEnemiesForTruth.length)
        ];
      const truthDamage = calculateDamage(
        casterOfTruth,
        randomEnemyTarget,
        truthBuff.effect.power,
        "physical",
        "atk"
      );
      console.log(
        `[DEBUG] 맹독: ${casterOfTruth.name}가 ${randomEnemyTarget.name}에게 ${truthDamage} 피해.`
      );
      logToBattleLog(
        `✦추가 공격✦ ${casterOfTruth.name}의 [맹독]: ${
          randomEnemyTarget.name
        }에게 ${truthDamage.toFixed(0)} 추가 피해.`
      );
      randomEnemyTarget.takeDamage(truthDamage, logToBattleLog, casterOfTruth);
    }
    actingChar.removeBuffById("truth_end_turn_attack_marker");
  }
}

// --- 5. 전투 흐름 및 행동 선택 함수 ---
function startBattle() {
  if (allyCharacters.length === 0 || enemyCharacters.length === 0) {
    alert("아군과 적군 모두 최소 한 명 이상의 캐릭터가 필요합니다.");
    return;
  }
  if (isBattleStarted) {
    alert("이미 전투가 시작되었습니다.");
    return;
  }

  isBattleStarted = true;
  currentTurn = 0;
  playerActionsQueue = [];
  actedAlliesThisTurn = [];
  logToBattleLog("\n【전투 시작】\n");
  [...allyCharacters, ...enemyCharacters].forEach((char) => {
    // 직군에 따른 maxHp 재설정
    if (char.job) {
      char.maxHp = 100;
      if (char.job === "힐러") {
        char.maxHp = 110;
      } else if (char.job === "딜러") {
        char.maxHp = 90;
      }
      // 전투 재시작 시 현재 체력을 최대 체력으로 회복
      char.currentHp = char.maxHp;
    } else if (enemyCharacters.includes(char)) {
      // 적군의 경우 이미 설정된 maxHp를 보존하고 현재 체력만 회복
      char.currentHp = char.maxHp;
    }

    char.currentHp = char.maxHp;
    char.isAlive = true;
    char.buffs = [];
    char.debuffs = [];
    char.shield = 0;
    char.aggroDamageStored = 0;
    char.lastSkillTurn = {};
    char.lastAttackedBy = null;
    char.currentTurnDamageTaken = 0;
    char.totalDamageTakenThisBattle = 0;

    // 직군별 카운터 초기화
    char.dealerExtraDamageCount = 0;
    char.healerBoostCount = 0;
    char.supporterShieldCount = 0;
  });
  displayCharacters();

  if (startButton) startButton.style.display = "none";

  prepareNewTurnCycle();
}

function prepareNewTurnCycle() {
  if (!isBattleStarted) {
    alert("전투를 시작해 주세요.");
    return;
  }

  playerAttackCountThisTurn = 0;
  currentTurn++;
  enemyPreviewAction = null;

  enemyCharacters.forEach((enemy) => {
    checkAndApplyEnrage(enemy, logToBattleLog);
  });

  logToBattleLog(`\n --- ${currentTurn} 턴 행동 선택 시작 --- \n`);

  if (
    (currentMapId === "B-1" || currentMapId === "B-2") &&
    currentTurn > 0 &&
    currentTurn % 4 === 0
  ) {
    console.log(
      `[DEBUG] prepareNewTurnCycle: 4의 배수 턴(${currentTurn}턴)이므로 추가 소환을 실행`
    );
    logToBattleLog(`\n --- 4턴 경과, 추가 몬스터가 소환됩니다. --- \n`);

    const clownCell = getRandomEmptyCell();
    if (clownCell) {
      summonMonsterAt("Clown", clownCell);
    } else {
      logToBattleLog("✦정보✦ 클라운을 소환할 빈 공간이 없습니다.");
    }

    const pierrotCell = getRandomEmptyCell();
    if (pierrotCell) {
      summonMonsterAt("Pierrot", pierrotCell);
    } else {
      logToBattleLog("✦정보✦ 피에로를 소환할 빈 공간이 없습니다.");
    }
  }

  const firstLivingEnemy = enemyCharacters.find((e) => e.isAlive);
  if (firstLivingEnemy) {
    enemyPreviewAction = previewEnemyAction(firstLivingEnemy);
  }

  displayCharacters();

  playerActionsQueue = [];
  actedAlliesThisTurn = [];
  if (skillSelectionArea) skillSelectionArea.style.display = "none";
  if (executeTurnButton) executeTurnButton.style.display = "none";
  if (skillDescriptionArea) skillDescriptionArea.innerHTML = "";

  promptAllySelection();
}

function promptAllySelection() {
  const aliveAllies = allyCharacters.filter((char) => char.isAlive);
  const availableAllies = aliveAllies.filter(
    (char) => !actedAlliesThisTurn.includes(char.id)
  );

  if (allySelectionButtonsDiv) allySelectionButtonsDiv.innerHTML = "";
  if (skillSelectionArea) skillSelectionArea.style.display = "none";

  if (availableAllies.length === 0 && aliveAllies.length > 0) {
    logToBattleLog(
      "모든 아군 캐릭터의 행동 선택이 완료되었습니다. 턴을 실행하세요."
    );
    if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = "none";
    if (executeTurnButton) executeTurnButton.style.display = "block";
  } else if (aliveAllies.length === 0) {
    logToBattleLog("행동할 수 있는 아군이 없습니다.");
    if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = "none";
    if (executeTurnButton) executeTurnButton.style.display = "block";
  } else {
    logToBattleLog(
      `행동할 아군을 선택하세요: ${availableAllies
        .map((a) => a.name)
        .join(", ")}`
    );
    if (allySelectionButtonsDiv) {
      allySelectionButtonsDiv.style.display = "block";
      availableAllies.forEach((ally) => {
        const button = document.createElement("button");
        button.textContent = `${ally.name} 행동 선택`;
        button.className = "button";
        button.style.margin = "5px";
        button.onclick = () => {
          if (allySelectionButtonsDiv)
            allySelectionButtonsDiv.style.display = "none";
          showSkillSelectionForCharacter(ally);
        };
        allySelectionButtonsDiv.appendChild(button);
      });
    }
    if (executeTurnButton) executeTurnButton.style.display = "none";
  }
}

function showSkillSelectionForCharacter(actingChar) {
  if (!actingChar || !actingChar.isAlive) {
    logToBattleLog("선택된 캐릭터가 없거나 전투 불능입니다.");
    promptAllySelection();
    return;
  }
  if (actedAlliesThisTurn.includes(actingChar.id)) {
    logToBattleLog(`${actingChar.name}은(는) 이미 이번 턴에 행동했습니다.`);
    promptAllySelection();
    return;
  }

  currentActingCharName.textContent = actingChar.name;
  selectedAction = {
    type: null,
    casterId: actingChar.id,
    skillId: null,
    targetId: null,
    subTargetId: null,
    moveDelta: null,
  };

  availableSkillsDiv.innerHTML = "";
  actingChar.skills.forEach((skillId) => {
    const skill = SKILLS[skillId];
    if (skill) {
      const button = document.createElement("button");
      button.textContent = skill.name;
      let cooldownMessage = "";
      let disabledByCooldown = false;

      if (skill.cooldown && skill.cooldown > 0) {
        const lastUsed = actingChar.lastSkillTurn[skill.id] || 0;
        if (lastUsed !== 0 && currentTurn - lastUsed < skill.cooldown) {
          disabledByCooldown = true;
          cooldownMessage = ` (${
            skill.cooldown - (currentTurn - lastUsed)
          }턴 남음)`;
        }
      }
      button.textContent += cooldownMessage;

      if (actingChar.hasDebuff("silence")) {
        const silencedTypes = [
          "어그로",
          "카운터",
          "지정 버프",
          "광역 버프",
          "광역 디버프",
        ];
        if (silencedTypes.includes(skill.type)) {
          button.disabled = true;
          button.textContent += " (침묵)";
        }
      }

      if (disabledByCooldown) {
        button.disabled = true;
        button.classList.add("on-cooldown");
      } else {
        button.disabled = false;
        button.classList.remove("on-cooldown");
      }
      button.onclick = () => selectSkill(skill.id, actingChar);
      availableSkillsDiv.appendChild(button);
    }
  });

  // '행동 포기' 같은 기타 액션을 담을 컨테이너
  const otherActionsDiv = document.createElement("div");
  otherActionsDiv.style.marginTop = "15px";
  otherActionsDiv.style.borderTop = "1px solid var(--color-border)";
  otherActionsDiv.style.paddingTop = "15px";

  const skipButton = document.createElement("button");
  skipButton.textContent = "행동 포기";
  skipButton.className = "button";
  // 행동 포기 버튼은 다른 색으로 보이게
  skipButton.style.background = "linear-gradient(145deg, #6c757d, #5a6268)";

  skipButton.onclick = () => {
    logToBattleLog(`✦준비✦ ${actingChar.name}, 행동을 포기합니다.`);
    playerActionsQueue.push({ caster: actingChar, type: "skip" });
    actedAlliesThisTurn.push(actingChar.id);

    skillSelectionArea.style.display = "none";
    if (skillDescriptionArea) skillDescriptionArea.innerHTML = "";

    // 다음 아군이 행동을 선택하도록 합니다.
    promptAllySelection();
  };
  otherActionsDiv.appendChild(skipButton);
  availableSkillsDiv.appendChild(otherActionsDiv);

  movementControlsArea.innerHTML =
    '<h4><span class="material-icons-outlined">open_with</span>이동</h4>';
  const directions = [
    [-1, -1, "↖"],
    [0, -1, "↑"],
    [1, -1, "↗"],
    [-1, 0, "←"],
    [1, 0, "→"],
    [-1, 1, "↙"],
    [0, 1, "↓"],
    [1, 1, "↘"],
  ];
  directions.forEach((dir) => {
    const button = document.createElement("button");
    button.textContent = dir[2];
    const targetX = actingChar.posX + dir[0];
    const targetY = actingChar.posY + dir[1];

    if (
      targetX < 0 ||
      targetX >= MAP_WIDTH ||
      targetY < 0 ||
      targetY >= MAP_HEIGHT ||
      (characterPositions[`${targetX},${targetY}`] &&
        characterPositions[`${targetX},${targetY}`] !== actingChar.id)
    ) {
      button.disabled = true;
    }
    button.onclick = () => selectMove({ dx: dir[0], dy: dir[1] }, actingChar);
    movementControlsArea.appendChild(button);
  });

  selectedTargetName.textContent = "없음";
  if (confirmActionButton) confirmActionButton.style.display = "none";
  if (skillSelectionArea) skillSelectionArea.style.display = "block";
  if (executeTurnButton) executeTurnButton.style.display = "none";
  displayCharacters();
}

function selectSkill(skillId, caster) {
  if (
    selectedAction.type === "skill" &&
    selectedAction.skillId === skillId &&
    selectedAction.targetId === null &&
    selectedAction.subTargetId === null
  ) {
    logToBattleLog(`[${SKILLS[skillId].name}] 스킬 선택 취소.`);
    selectedAction.type = null;
    selectedAction.skillId = null;
    if (skillDescriptionArea)
      skillDescriptionArea.innerHTML = "스킬 선택이 취소되었습니다.";
    if (confirmActionButton) confirmActionButton.style.display = "none";
    selectedTargetName.textContent = "없음";
    return;
  }

  selectedAction.type = "skill";
  selectedAction.skillId = skillId;
  selectedAction.targetId = null;
  selectedAction.subTargetId = null;
  selectedAction.moveDelta = null;

  const skill = SKILLS[skillId];
  logToBattleLog(
    `${caster.name}, [${skill.name}] 스킬 선택. 대상을 선택해 주세요.`
  );

  if (skillDescriptionArea) {
    skillDescriptionArea.innerHTML = `<strong>${skill.name}</strong>: ${
      skill.description || "설명 없음"
    }`;
  }

  if (
    skill.targetSelection === "self" ||
    skill.targetType === "all_allies" ||
    skill.targetType === "all_enemies"
  ) {
    selectedAction.targetId = caster.id;
    selectedTargetName.textContent =
      skill.targetSelection === "self" ? caster.name : "전체 대상";
    if (confirmActionButton) confirmActionButton.style.display = "block";
  } else {
    selectedTargetName.textContent = "대상 필요";
    if (confirmActionButton) confirmActionButton.style.display = "none";
  }
  displayCharacters();
}

function selectMove(moveDelta, caster) {
  const targetX = caster.posX + moveDelta.dx;
  const targetY = caster.posY + moveDelta.dy;

  if (
    targetX < 0 ||
    targetX >= MAP_WIDTH ||
    targetY < 0 ||
    targetY >= MAP_HEIGHT
  ) {
    logToBattleLog("맵 경계를 벗어날 수 없습니다.");
    return;
  }
  if (
    characterPositions[`${targetX},${targetY}`] &&
    characterPositions[`${targetX},${targetY}`] !== caster.id
  ) {
    logToBattleLog("다른 캐릭터가 있는 곳으로 이동할 수 없습니다.");
    return;
  }

  if (skillDescriptionArea)
    skillDescriptionArea.innerHTML = "이동이 선택되었습니다.";

  selectedAction.type = "move";
  selectedAction.skillId = null;
  selectedAction.targetId = null;
  selectedAction.subTargetId = null;
  selectedAction.moveDelta = moveDelta;

  logToBattleLog(`${caster.name}, (${targetX}, ${targetY})로 이동 선택.`);
  selectedTargetName.textContent = `이동 (${targetX},${targetY})`;
  if (confirmActionButton) confirmActionButton.style.display = "block";
  displayCharacters();
}

function selectTarget(targetCharId) {
  if (selectedAction.type !== "skill" || !selectedAction.skillId) return;

  const caster = findCharacterById(selectedAction.casterId);
  const skill = SKILLS[selectedAction.skillId];

  let targetChar = findCharacterById(targetCharId);
  if (!targetChar) {
    targetChar = mapObjects.find((obj) => obj.id === targetCharId);
  }

  if (!targetChar || !targetChar.isAlive) {
    logToBattleLog("유효하지 않은 대상입니다(이미 쓰러졌거나 없음).");
    return;
  }

  let canConfirm = false;

  if (selectedAction.targetId === targetCharId) {
    logToBattleLog(`[${targetChar.name}] 대상 선택 취소.`);
    selectedAction.targetId = null;
    selectedAction.subTargetId = null;
    selectedTargetName.textContent = "대상 필요";
    if (confirmActionButton) confirmActionButton.style.display = "none";
    displayCharacters();
    return;
  }
  if (
    skill.targetSelection === "two_enemies" &&
    selectedAction.subTargetId === targetCharId
  ) {
    logToBattleLog(`두 번째 대상 [${targetChar.name}] 선택 취소.`);
    selectedAction.subTargetId = null;
    const mainTargetName =
      findCharacterById(selectedAction.targetId)?.name || "첫 번째 대상";
    selectedTargetName.textContent = `${mainTargetName}, 두 번째 대상 필요`;
    if (confirmActionButton) confirmActionButton.style.display = "none";
    displayCharacters();
    return;
  }

  if (skill.targetSelection === "enemy") {
    if (enemyCharacters.includes(targetChar) || targetChar.isGimmickObject) {
      selectedAction.targetId = targetCharId;
      selectedTargetName.textContent = targetChar.name;
      canConfirm = true;
    } else {
      alert("적군 또는 파괴 가능한 기믹 오브젝트를 대상으로 선택해야 합니다.");
    }
  } else if (skill.targetSelection === "ally") {
    if (allyCharacters.includes(targetChar)) {
      selectedAction.targetId = targetCharId;
      selectedTargetName.textContent = targetChar.name;
      canConfirm = true;
    } else alert("아군을 대상으로 선택해야 합니다.");
  } else if (skill.targetSelection === "single_ally_or_gimmick") {
    if (
      allyCharacters.includes(targetChar) ||
      (targetChar.isGimmickObject && targetChar.type === "spring")
    ) {
      selectedAction.targetId = targetCharId;
      selectedTargetName.textContent = targetChar.name;
      canConfirm = true;
    } else {
      alert("아군 또는 메마른 생명의 샘을 대상으로 선택해야 합니다.");
    }
  } else if (skill.targetSelection === "ally_or_self") {
    if (allyCharacters.includes(targetChar) || caster.id === targetCharId) {
      selectedAction.targetId = targetCharId;
      selectedTargetName.textContent = targetChar.name;
      canConfirm = true;
    } else alert("아군 또는 자신을 대상으로 선택해야 합니다.");
  } else if (skill.targetSelection === "two_enemies") {
    if (!enemyCharacters.includes(targetChar)) {
      alert("적군을 선택해야 합니다.");
      return;
    }

    if (!selectedAction.targetId) {
      selectedAction.targetId = targetCharId;
      selectedTargetName.textContent = targetChar.name;
      logToBattleLog(
        `[${skill.name}] 첫 번째 대상: ${targetChar.name}. 두 번째 대상을 선택해 주세요.`
      );
    } else if (
      selectedAction.targetId !== targetCharId &&
      !selectedAction.subTargetId
    ) {
      selectedAction.subTargetId = targetCharId;
      const mainTargetName = findCharacterById(selectedAction.targetId).name;
      selectedTargetName.textContent = `${mainTargetName}, ${targetChar.name}`;
      canConfirm = true;
    } else if (selectedAction.targetId === targetCharId) {
      // 재클릭 취소 로직
    } else if (selectedAction.subTargetId) {
      alert(
        "이미 두 명의 대상을 모두 선택했습니다. 기존 선택을 취소하려면 대상을 다시 클릭하세요."
      );
    }
  }

  if (confirmActionButton)
    confirmActionButton.style.display = canConfirm ? "block" : "none";
  displayCharacters();
}

function confirmAction() {
  if (!selectedAction.type) {
    alert("행동을 선택해 주세요.");
    return;
  }

  const caster = findCharacterById(selectedAction.casterId);
  if (!caster) {
    alert("시전자를 찾을 수 없습니다.");
    return;
  }

  if (actedAlliesThisTurn.includes(caster.id)) {
    alert(`${caster.name}은(는) 이미 이번 턴에 행동을 확정했습니다.`);
    promptAllySelection();
    return;
  }

  if (selectedAction.type === "skill") {
    const skill = SKILLS[selectedAction.skillId];
    const hasDisarmDebuff = caster.hasDebuff("disarm");
    const isAttackSkill = skill.type.includes("공격");

    if (hasDisarmDebuff && isAttackSkill) {
      logToBattleLog(
        `✦정보✦ ${caster.name}의 [무장 해제] 상태로 인해 공격 스킬을 사용할 수 없습니다.`
      );
      selectedAction.type = null;
      selectedAction.skillId = null;
      selectedAction.targetId = null;
      showSkillSelectionForCharacter(caster);
      return;
    }
  }

  let actionDetails = { caster: caster, type: selectedAction.type };
  let targetDescription = "정보 없음";

  if (selectedAction.type === "skill") {
    const skill = SKILLS[selectedAction.skillId];
    if (!skill) {
      alert("선택된 스킬 정보를 찾을 수 없습니다.");
      return;
    }
    actionDetails.skill = skill;

    if (skill.targetSelection === "self") {
      targetDescription = caster.name;
      actionDetails.mainTarget = caster;
    } else if (
      skill.targetSelection === "all_allies" ||
      skill.targetSelection === "all_enemies"
    ) {
      targetDescription = "전체 대상";
    } else if (selectedAction.targetId) {
      const mainTargetObj = findCharacterById(selectedAction.targetId);
      if (!mainTargetObj) {
        alert("첫 번째 대상을 찾을 수 없습니다.");
        return;
      }
      targetDescription = mainTargetObj.name;
      actionDetails.mainTarget = mainTargetObj;

      if (skill.targetSelection === "two_enemies") {
        if (selectedAction.subTargetId) {
          const subTargetObj = findCharacterById(selectedAction.subTargetId);
          if (!subTargetObj) {
            alert("두 번째 대상을 찾을 수 없습니다.");
            return;
          }
          targetDescription += `, ${subTargetObj.name}`;
          actionDetails.subTarget = subTargetObj;
        } else {
          alert("두 번째 대상을 선택해야 합니다.");
          return;
        }
      }
    } else if (
      skill.targetSelection !== "self" &&
      skill.targetType !== "all_allies" &&
      skill.targetType !== "all_enemies"
    ) {
      alert("스킬 대상을 선택해야 합니다.");
      return;
    }
    logToBattleLog(
      `✦준비✦ ${caster.name}, [${skill.name}] 스킬 사용 준비. (대상: ${targetDescription})`
    );
  } else if (selectedAction.type === "move") {
    actionDetails.moveDelta = selectedAction.moveDelta;
    if (!selectedAction.moveDelta) {
      alert("이동 정보 오류. 다시 선택해 주세요.");
      showSkillSelectionForCharacter(caster);
      return;
    }
    const targetX = caster.posX + selectedAction.moveDelta.dx;
    const targetY = caster.posY + selectedAction.moveDelta.dy;
    logToBattleLog(
      `✦준비✦ ${caster.name}, (${targetX},${targetY})(으)로 이동 준비.`
    );
  }

  if (skillDescriptionArea) skillDescriptionArea.innerHTML = "";

  playerActionsQueue.push(actionDetails);
  actedAlliesThisTurn.push(caster.id);

  promptAllySelection();
}

async function executeSingleAction(action) {
  const caster = action.caster;

  if (caster.hasDebuff("nightmare")) {
    logToBattleLog(`✦정보✦ ${caster.name}, [악몽]에 빠져 행동할 수 없습니다.`);
    return false;
  }

  if (!caster || !caster.isAlive) {
    console.log(
      `[DEBUG] executeSingleAction: Caster ${
        caster ? caster.name : "N/A"
      } is not alive or not found. Returning false.`
    );
    return false;
  }

  if (action.type === "skill" && caster.hasBuff("restoration")) {
    const restorationBuff = caster.buffs.find((b) => b.id === "restoration");
    if (restorationBuff) {
      const aliveAllies = allyCharacters.filter((a) => a.isAlive);
      if (aliveAllies.length > 0) {
        let lowestHpAlly = aliveAllies[0];
        for (let i = 1; i < aliveAllies.length; i++) {
          if (aliveAllies[i].currentHp < lowestHpAlly.currentHp) {
            lowestHpAlly = aliveAllies[i];
          }
        }
        const extraHeal = restorationBuff.effect.healPower;
        applyHeal(lowestHpAlly, extraHeal, logToBattleLog, "[환원] 효과");
      }
    }
  }

  applyTurnStartEffects(caster);

  logToBattleLog(`\n--- ${caster.name}, 행동 시작 (${currentTurn}턴) ---`);

  if (action.type === "skill") {
    const skill = action.skill;
    let skillSuccess = true;
    if (skill.execute) {
      let mainTarget = action.mainTarget;
      let subTarget = action.subTarget;
      let actualAllies = allyCharacters.filter((a) => a.isAlive);
      let actualEnemies = enemyCharacters.filter((e) => e.isAlive);

      switch (skill.targetType) {
        case "self":
        case "all_allies":
          skillSuccess = skill.execute(
            caster,
            actualAllies,
            actualEnemies,
            logToBattleLog
          );
          break;
        case "all_enemies":
          skillSuccess = skill.execute(caster, actualEnemies, logToBattleLog);
          break;
        case "single_enemy":
        case "single_ally":
        case "single_ally_or_self":
          skillSuccess = skill.execute(
            caster,
            mainTarget,
            actualAllies,
            actualEnemies,
            logToBattleLog
          );
          break;
        case "single_ally_or_gimmick":
          skillSuccess = skill.execute(
            caster,
            mainTarget,
            actualAllies,
            actualEnemies,
            logToBattleLog
          );
          break;
        case "multi_enemy":
          skillSuccess = skill.execute(
            caster,
            mainTarget,
            actualAllies,
            actualEnemies,
            logToBattleLog
          );
          break;
        default:
          console.warn(
            `[WARN] Unknown/Unhandled skill targetType: ${skill.targetType} for skill ${skill.name}. Using (caster, mainTarget, allies, enemies, battleLog) signature.`
          );
          skillSuccess = skill.execute(
            caster,
            mainTarget,
            actualAllies,
            actualEnemies,
            logToBattleLog
          );
          break;
      }
    }
    // 딜러 직군 효과
    if (
      caster.job === "딜러" &&
      skill.type.includes("공격") &&
      action.mainTarget &&
      action.mainTarget.isAlive
    ) {
      if (
        caster.currentHp <= caster.maxHp * 0.5 &&
        caster.dealerExtraDamageCount < 2
      ) {
        const extraDmg = Math.round(caster.getEffectiveStat("atk") * 0.05);
        caster.dealerExtraDamageCount++;
        logToBattleLog(
          `✦직군 효과(딜러)✦ [결의의 일격] 발동. ${
            action.mainTarget.name
          }에게 ${extraDmg}의 추가 피해를 입힙니다. (남은 횟수: ${
            2 - caster.dealerExtraDamageCount
          })`
        );
        action.mainTarget.takeDamage(extraDmg, logToBattleLog, caster);
      }
    }
  } else if (action.type === "move") {
    const oldX = caster.posX;
    const oldY = caster.posY;
    let newX = caster.posX + action.moveDelta.dx;
    let newY = caster.posY + action.moveDelta.dy;

    if (newX < 0 || newX >= MAP_WIDTH || newY < 0 || newY >= MAP_HEIGHT) {
      logToBattleLog(
        `❗ ${caster.name}의 이동 실행 실패: (${newX},${newY})는 맵 범위를 벗어납니다.`
      );
    } else if (
      characterPositions[`${newX},${newY}`] &&
      characterPositions[`${newX},${newY}`] !== caster.id
    ) {
      logToBattleLog(
        `❗ ${caster.name}의 이동 실행 실패: (${newX},${newY})에 다른 캐릭터가 있습니다.`
      );
    } else {
      if (oldX !== -1 && oldY !== -1)
        delete characterPositions[`${oldX},${oldY}`];
      caster.posX = newX;
      caster.posY = newY;
      characterPositions[`${newX},${newY}`] = caster.id;
      logToBattleLog(
        `✦이동✦ ${caster.name}, (${oldX},${oldY})에서 (${newX},${newY})(으)로 이동 완료.`
      );

      // 이동이 끝난 직후, 현재 위치가 금지 구역인지 확인합니다.
      let damagePercent = 0;
      const newPos = { x: caster.posX, y: caster.posY };

      // 5x5 금지 구역
      if (
        mapShrinkState === 2 &&
        (newPos.x <= 1 || newPos.x >= 7 || newPos.y <= 1 || newPos.y >= 7)
      ) {
        damagePercent = 0.9; // 현재 체력의 90% 피해
      }
      // 7x7 금지 구역
      else if (
        mapShrinkState === 1 &&
        (newPos.x === 0 || newPos.x === 8 || newPos.y === 0 || newPos.y === 8)
      ) {
        damagePercent = 0.8; // 현재 체력의 80% 피해
      }

      if (damagePercent > 0) {
        logToBattleLog(
          `✦기믹 피해✦ 폐쇄된 구역을 밟아 ${caster.name}에게 피해가 발생합니다.`
        );
        const gimmickDamage = Math.round(caster.currentHp * damagePercent);
        // 기믹 피해이므로 공격자는 null로 처리합니다.
        caster.takeDamage(gimmickDamage, logToBattleLog, null);
      }
    }
  } else if (action.type === "skip") {
    logToBattleLog(`✦정보✦ ${caster.name}, 행동하지 않고 턴을 넘깁니다.`);
  }

  processEndOfTurnEffects(caster);
  displayCharacters();

  if (checkBattleEnd()) {
    return true;
  }
  return false;
}

async function executeBattleTurn() {
  if (!isBattleStarted) {
    alert("전투를 시작해 주세요.");
    return;
  }

  const aliveAlliesCount = allyCharacters.filter((c) => c.isAlive).length;
  if (playerActionsQueue.length < aliveAlliesCount && aliveAlliesCount > 0) {
    alert("모든 살아 있는 아군의 행동을 선택해 주세요.");
    promptAllySelection();
    return;
  }

  if (skillSelectionArea) skillSelectionArea.style.display = "none";
  if (executeTurnButton) executeTurnButton.style.display = "none";
  if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = "none";
  if (skillDescriptionArea) skillDescriptionArea.innerHTML = "";

  logToBattleLog(`\n--- ${currentTurn} 턴 아군 행동 실행 ---`);
  for (const action of playerActionsQueue) {
    if (!action.caster.isAlive) continue;
    if (await executeSingleAction(action)) {
      return;
    }
  }

  if (checkBattleEnd()) return;

  logToBattleLog(`\n--- ${currentTurn} 턴 적군 행동 준비 ---`);

  resolveDressRehearsalMission(); // 플레이어 턴 종료 후 미션 성공 여부 판정
  resolveMinionGimmicks(); // 쫄병 기믹 확인 함수

  resolveGimmickEffects();
  resolveClownGimmick();

  enemyCharacters.forEach((enemy) => {
    const telegraphBuff = enemy.buffs.find(
      (b) => b.id === "path_of_ruin_telegraph"
    );
    if (telegraphBuff && telegraphBuff.turnsLeft === 2) {
      console.log(
        `[DEBUG] executeBattleTurn: [균열의 길] 기믹 판정 실행. 대상: ${enemy.name}`
      );
      logToBattleLog(`✦기믹 판정✦ [균열의 길] 효과가 발동됩니다.`);
      const { predictedCol, predictedRow } = telegraphBuff.effect;
      const targets = allyCharacters.filter(
        (ally) =>
          ally.isAlive &&
          (ally.posX === predictedCol || ally.posY === predictedRow)
      );

      if (targets.length > 0) {
        console.log(
          `[DEBUG] executeBattleTurn: [균열의 길] 파훼 실패. 대상 플레이어 수: ${targets.length}`
        );
        logToBattleLog(
          `  ✦파훼 실패✦: ${targets
            .map((t) => t.name)
            .join(", ")}, 균열의 길 위에 있습니다.`
        );
      } else {
        console.log("[DEBUG] executeBattleTurn: [균열의 길] 파훼 성공.");
        logToBattleLog(`  ✦파훼 성공✦: 균열의 길 위에 아무도 없습니다.`);
        enemy.addDebuff("rupture_debuff", "[붕괴]", 2, {
          defReduction: 0.3,
          mdefReduction: 0.3,
        });
        logToBattleLog(`  ${enemy.name}에게 [붕괴] 디버프가 적용됩니다. (2턴)`);
      }

      enemy.removeBuffById("path_of_ruin_telegraph");
    }
  });

  if (checkBattleEnd()) return;

  logToBattleLog(`\n--- ${currentTurn} 턴 적군 행동 실행 ---`);
  for (const enemyChar of enemyCharacters) {
    if (enemyChar.isAlive) {
      if (await performEnemyAction(enemyChar)) {
        return; // 여기서 전투 종료 시 함수 종료
      }
    }
  }

  // 1. 먼저 전투 종료 여부를 변수에 담아 중복 실행을 막습니다.
  const battleEnded = checkBattleEnd();

  // 2. 전투가 종료되지 않았고, 전투 상태가 유지 중일 때만 다음 턴을 준비합니다.
  if (!battleEnded && isBattleStarted) {
    prepareNewTurnCycle();
  } else {
    // 3. 전투가 종료되었다면 로그를 출력하고 다시 시작 버튼을 노출합니다.
    if (startButton) startButton.style.display = "block";
    console.log("전투가 종료되어 다음 턴을 준비하지 않습니다.");
  }
}

function previewEnemyAction(enemyChar) {
  console.log(
    `[DEBUG] Turn ${currentTurn}: previewEnemyAction 시작. 대상: ${enemyChar.name}`
  );

  // 1. B-2 보스 '카르나블룸' 전용: [대본의 반역] 예고 로직 (제시해주신 원본 코드 유지)
  if (enemyChar.name === "카르나블룸" && enemyChar.type === "천체") {
    const actionChoice = Math.random();
    // 25% 확률로 '대본의 반역'을 예고
    if (actionChoice < 0.25) {
      const safeRow = Math.floor(Math.random() * MAP_HEIGHT);
      const safeCol = Math.floor(Math.random() * MAP_WIDTH);

      const safeArea = [];
      // 안전한 세로줄 추가
      for (let y = 0; y < MAP_HEIGHT; y++) {
        safeArea.push({ x: safeCol, y: y });
      }
      // 안전한 가로줄 추가
      for (let x = 0; x < MAP_WIDTH; x++) {
        // 겹치는 부분은 제외하고 추가
        if (x !== safeCol) {
          safeArea.push({ x: x, y: safeRow });
        }
      }

      const gimmickData = GIMMICK_DATA["GIMMICK_Script_Reversal"];
      if (gimmickData && gimmickData.script) {
        logToBattleLog(gimmickData.script);
      }
      logToBattleLog(` ↪︎ 무대 조명이 빛나며 안전지대가 예고됩니다.`);

      return {
        casterId: enemyChar.id,
        skillId: "GIMMICK_Script_Reversal",
        // 'hitArea' 라는 이름으로 '안전지대' 정보를 넘김 (파란색 표시)
        hitArea: safeArea,
        dynamicData: { safeRow, safeCol },
      };
    }
    // 확률에 걸리지 않은 경우, 여기서 null을 반환하지 않고 아래의 일반 스킬 선택 로직으로
  }

  // 2. 일반 스킬 및 기믹 선택 로직
  const allSkills = { ...SKILLS, ...MONSTER_SKILLS };
  let skillToUseId = null;
  let hitArea = [];

  const isBoss =
    enemyChar.skills.includes("SKILL_Birth_of_Vines") ||
    enemyChar.skills.includes("SKILL_Seismic_Fissure");
  const isClownOrPierrot =
    enemyChar.name === "클라운" || enemyChar.name === "피에로";

  if (isBoss) {
    const allActions = [
      ...(enemyChar.gimmicks || []),
      ...(enemyChar.skills || []),
    ];
    if (allActions.length > 0) {
      skillToUseId = allActions[Math.floor(Math.random() * allActions.length)];
      console.log(`[DEBUG] 보스 행동 결정: ${skillToUseId}`);
    }
  } else if (isClownOrPierrot) {
    if (enemyChar.skills && enemyChar.skills.length > 0) {
      skillToUseId =
        enemyChar.skills[Math.floor(Math.random() * enemyChar.skills.length)];
      console.log(`[DEBUG] 광대 행동 결정: ${skillToUseId}`);
    }
  }

  if (!skillToUseId) {
    console.log(
      `[DEBUG] previewEnemyAction: 사용할 스킬이 없어 기본 공격을 수행.`
    );
    return null;
  }

  const skillDefinition = allSkills[skillToUseId] || GIMMICK_DATA[skillToUseId];
  if (!skillDefinition) {
    console.log(
      `[DEBUG] previewEnemyAction: 스킬 ID [${skillToUseId}]에 대한 정의를 찾을 수 없음.`
    );
    return null;
  }

  // 3. 지정한 2가지 기믹에 대한 장판 좌표 생성
  if (skillToUseId === "GIMMICK_Path_of_Ruin") {
    const predictedCol = Math.floor(Math.random() * MAP_WIDTH);
    const predictedRow = Math.floor(Math.random() * MAP_HEIGHT);

    // 피격 구역 계산 (주황색 표시)
    for (let x = 0; x < MAP_WIDTH; x++) hitArea.push({ x, y: predictedRow });
    for (let y = 0; y < MAP_HEIGHT; y++) {
      if (y !== predictedRow) hitArea.push({ x: predictedCol, y });
    }
    skillDefinition.previewData = { predictedCol, predictedRow };
  } else if (skillToUseId.startsWith("GIMMICK_Aegis_of_Earth")) {
    const coordsStr = skillDefinition.coords;
    if (coordsStr) {
      // 안전 구역 좌표 파싱 (파란색 표시)
      hitArea = coordsStr.split(";").map((s) => {
        const [x, y] = s.split(",").map(Number);
        return { x, y };
      });
    }
  }
  // [흡수의 술식] 등 다른 기믹이나 일반 스킬은 hitArea를 빈 배열로 유지

  // 4. [흡수의 술식] 관련 데이터 생성
  if (skillToUseId === "GIMMICK_Seed_of_Devour") {
    const subGimmickChoice = Math.floor(Math.random() * 3) + 1;
    const gimmickCoordsStr = skillDefinition.coords;
    const availableCoords = gimmickCoordsStr
      .split(";")
      .map((s) => {
        const [x, y] = s.split(",").map(Number);
        return { x, y };
      })
      .filter((pos) => !characterPositions[`${pos.x},${pos.y}`]);

    let objectsToSpawnInfo = [];
    if (subGimmickChoice === 1) {
      for (let i = 0; i < 2 && availableCoords.length > 0; i++)
        objectsToSpawnInfo.push({
          type: "fruit",
          pos: availableCoords.splice(
            Math.floor(Math.random() * availableCoords.length),
            1
          )[0],
        });
    } else if (subGimmickChoice === 2) {
      for (let i = 0; i < 3 && availableCoords.length > 0; i++)
        objectsToSpawnInfo.push({
          type: "fissure",
          pos: availableCoords.splice(
            Math.floor(Math.random() * availableCoords.length),
            1
          )[0],
        });
    } else if (subGimmickChoice === 3) {
      if (availableCoords.length > 0)
        objectsToSpawnInfo.push({
          type: "spring",
          pos: availableCoords.splice(
            Math.floor(Math.random() * availableCoords.length),
            1
          )[0],
        });
    }
    skillDefinition.previewData = { subGimmickChoice, objectsToSpawnInfo };

    const scriptToShow =
      GIMMICK_DATA[skillToUseId][`subGimmick${subGimmickChoice}`]?.script;
    if (scriptToShow) logToBattleLog(scriptToShow);
  } else {
    // 일반 스킬의 스크립트 출력
    const scriptToShow = skillDefinition.script || skillDefinition.flavorText;
    if (scriptToShow) logToBattleLog(scriptToShow);
  }

  return {
    casterId: enemyChar.id,
    skillId: skillToUseId,
    hitArea: hitArea,
    dynamicData: skillDefinition.previewData || {},
  };
}

const ENRAGE_TURN_THRESHOLD = 20;
const ENRAGE_HP_THRESHOLD = 0.2;

function checkAndApplyEnrage(character, battleLog) {
  if (!character.isAlive || character.isEnraged) {
    return;
  }

  const hpPercentage = character.currentHp / character.maxHp;
  let enrageTriggered = false;
  let triggerReason = "";

  if (currentTurn > ENRAGE_TURN_THRESHOLD) {
    triggerReason = `${ENRAGE_TURN_THRESHOLD}턴 경과`;
    enrageTriggered = true;
  } else if (hpPercentage <= ENRAGE_HP_THRESHOLD) {
    triggerReason = `체력 ${Math.round(ENRAGE_HP_THRESHOLD * 100)}% 이하`;
    enrageTriggered = true;
  }

  if (enrageTriggered) {
    character.isEnraged = true;
    const originalName = character.name;

    if (originalName.includes("테르모르")) {
      character.name = "분노한 테르모르";
    }

    battleLog(`✦광폭화✦ ${triggerReason}: ${originalName}, 분노에 휩싸입니다.`);

    character.atk = Math.round(character.atk * 1.5);
    character.matk = Math.round(character.matk * 1.5);
    character.def = Math.round(character.def * 1.5);
    character.mdef = Math.round(character.mdef * 1.5);

    displayCharacters();
  }
}

function resolveGimmickEffects() {
  if (!activeGimmickState || currentTurn < activeGimmickState.startTurn + 3) {
    return;
  }

  logToBattleLog(
    `✦기믹 판정✦ [${activeGimmickState.type}]의 효과를 판정합니다.`
  );
  const boss = enemyCharacters.find((e) => e.name === "테르모르");
  if (!boss) return;

  if (activeGimmickState.type === "subGimmick1") {
    const remainingFruits = mapObjects.filter((obj) =>
      activeGimmickState.objectIds.includes(obj.id)
    );
    if (remainingFruits.length === 0) {
      logToBattleLog(`  ✦파훼 성공✦: 모든 열매를 파괴했습니다.`);
      const damageToBoss = Math.round(boss.maxHp * 0.05);
      boss.takeDamage(damageToBoss, logToBattleLog, null);
      logToBattleLog(
        `  테르모르가 폭발로 ${damageToBoss}의 추가 피해를 입습니다.`
      );
      allyCharacters
        .filter((a) => a.isAlive)
        .forEach((ally) => {
          const healAmount = Math.round(ally.maxHp * 0.1);
          applyHeal(ally, healAmount, logToBattleLog, "기믹 성공");
        });
    } else {
      logToBattleLog(
        `  ✦파훼 실패✦: ${remainingFruits.length}개의 열매가 남았습니다.`
      );
      const bossHeal = Math.round(boss.maxHp * 0.1);
      applyHeal(boss, bossHeal, logToBattleLog, "기믹 실패");
      const debuffCount = remainingFruits.length * 3;
      const livingAllies = allyCharacters.filter((a) => a.isAlive);
      for (let i = 0; i < debuffCount && livingAllies.length > 0; i++) {
        const target =
          livingAllies[Math.floor(Math.random() * livingAllies.length)];
        target.addDebuff("disarm", "[무장 해제]", 1, {});
        logToBattleLog(`  ${target.name}에게 [무장 해제]가 1턴 부여됩니다.`);
      }
    }
  } else if (activeGimmickState.type === "subGimmick2") {
    const fissures = mapObjects.filter((obj) =>
      activeGimmickState.objectIds.includes(obj.id)
    );
    const emptyFissures = fissures.filter(
      (f) =>
        !allyCharacters.some(
          (a) => a.isAlive && a.posX === f.posX && a.posY === f.posY
        )
    );

    fissures.forEach((fissure) => {
      const playerOnTop = allyCharacters.find(
        (a) => a.isAlive && a.posX === fissure.posX && a.posY === fissure.posY
      );
      if (playerOnTop) {
        logToBattleLog(
          `  ${playerOnTop.name}, [불안정한 균열]의 폭발을 막았습니다.`
        );
        playerOnTop.addDebuff("fissure_dot", "[균열]", 2, {
          description: "턴 종료 시 현재 체력의 10% 피해 (2턴)",
          dotPercent: 0.1,
        });
        logToBattleLog(
          `  대가로 ${playerOnTop.name}에게 [균열] 디버프를 얻습니다.`
        );
      }
    });

    if (emptyFissures.length > 0) {
      logToBattleLog(
        `  ✦파훼 실패✦: ${emptyFissures.length}개의 균열이 폭발하여 광역 피해를 입힙니다.`
      );
      const damage = Math.round(
        boss.getEffectiveStat("matk") * emptyFissures.length
      );
      allyCharacters
        .filter((a) => a.isAlive)
        .forEach((ally) => {
          ally.takeDamage(damage, logToBattleLog, boss);
        });
    }
  } else if (activeGimmickState.type === "subGimmick3") {
    const spring = mapObjects.find((obj) =>
      activeGimmickState.objectIds.includes(obj.id)
    );
    if (spring) {
      if (spring.healingReceived >= spring.healingGoal) {
        logToBattleLog(
          `  ✦파훼 성공✦: 메마른 샘이 정화되었으나, 넘치는 생명력에 모두가 피해를 입습니다.`
        );
        const damage = 0.05;
        allyCharacters
          .filter((a) => a.isAlive)
          .forEach((ally) => {
            const dmgAmount = Math.round(ally.maxHp * damage);
            ally.takeDamage(dmgAmount, logToBattleLog, null);
          });
      } else {
        logToBattleLog(
          `  ✦파훼 실패✦: 메마른 샘이 분노하여 모두에게 강력한 피해를 입힙니다.`
        );
        const damage = 0.3;
        allyCharacters
          .filter((a) => a.isAlive)
          .forEach((ally) => {
            const dmgAmount = Math.round(ally.maxHp * damage);
            ally.takeDamage(dmgAmount, logToBattleLog, null);
          });
      }
    }
  }

  mapObjects = mapObjects.filter(
    (obj) => !activeGimmickState.objectIds.includes(obj.id)
  );
  activeGimmickState.objectIds.forEach((id) => {
    const posKey = Object.keys(characterPositions).find(
      (key) => characterPositions[key] === id
    );
    if (posKey) delete characterPositions[posKey];
  });
  activeGimmickState = null;
  displayCharacters();
}

function resolveClownGimmick() {
  if (
    !activeGimmickState ||
    !activeGimmickState.type.startsWith("clown_emotion")
  )
    return;

  // 기믹이 발동되고 지정된 턴(duration)이 지나야 판정
  if (
    currentTurn >=
    activeGimmickState.startTurn + activeGimmickState.duration
  ) {
    let success = false;
    const state = activeGimmickState;
    logToBattleLog(
      `✦기믹 판정✦ [광대의 감정] 결과: 클라운 ${state.clownHits}회, 피에로 ${state.pierrotHits}회 타격.`
    );

    if (state.type === "clown_emotion_laugh") {
      if (state.clownHits >= 5 && state.pierrotHits <= 5) success = true;
    } else {
      // 'clown_emotion_tear'
      if (state.clownHits <= 5 && state.pierrotHits >= 5) success = true;
    }

    if (success) {
      logToBattleLog("✦기믹 성공✦  모든 광대가 1턴간 행동 불가 상태가 됩니다.");
      enemyCharacters.forEach((e) => {
        if (e.isAlive && (e.name === "클라운" || e.name === "피에로")) {
          e.addDebuff("stun", "[행동 불가]", 2, { category: "제어" });
        }
      });
    } else {
      logToBattleLog(
        "✦기믹 실패✦ 모든 아군이 1턴간 행동 불가 상태가 되고, 광대들이 폭주합니다."
      );
      allyCharacters.forEach((a) => {
        if (a.isAlive) {
          a.addDebuff("stun", "[행동 불가]", 2, { category: "제어" });
        }
      });
      enemyCharacters.forEach((e) => {
        if (e.isAlive && (e.name === "클라운" || e.name === "피에로")) {
          e.addBuff("enraged_range", "[폭주: 범위 증가]", 4, {
            rangeIncrease: 1,
          });
          logToBattleLog(
            `✦버프✦ ${e.name}, [폭주]하여 공격 범위가 증가합니다(3턴).`
          );
        }
      });
    }

    activeGimmickState = null;
  }
}

async function performEnemyAction(enemyChar) {
  if (!enemyChar.isAlive) return false;

  // 'groggy' 디버프에 걸렸으면 행동하지 않고 턴을 넘깁니다.
  if (enemyChar.hasDebuff("groggy")) {
    logToBattleLog(
      `✦정보✦ ${enemyChar.name}는 [침묵] 상태이므로 행동할 수 없습니다.`
    );
    applyTurnStartEffects(enemyChar); // 버프/디버프 턴은 흘러가도록
    return checkBattleEnd();
  }

  applyTurnStartEffects(enemyChar);
  if (!enemyChar.isAlive) return checkBattleEnd();

  logToBattleLog(`\n--- ${enemyChar.name} 행동 (${currentTurn}턴) ---`);

  let possibleMoves = [];
  if (enemyChar.name === "클라운") {
    possibleMoves = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
  } else if (enemyChar.name === "피에로") {
    possibleMoves = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }

  if (possibleMoves.length > 0) {
    const validMoves = possibleMoves
      .map((move) => {
        const newX = enemyChar.posX + move[0];
        const newY = enemyChar.posY + move[1];
        if (
          newX >= 0 &&
          newX < MAP_WIDTH &&
          newY >= 0 &&
          newY < MAP_HEIGHT &&
          !characterPositions[`${newX},${newY}`]
        ) {
          return { x: newX, y: newY };
        }
        return null;
      })
      .filter((move) => move !== null);

    if (validMoves.length > 0) {
      const chosenMove =
        validMoves[Math.floor(Math.random() * validMoves.length)];
      const oldX = enemyChar.posX;
      const oldY = enemyChar.posY;
      delete characterPositions[`${oldX},${oldY}`];
      enemyChar.posX = chosenMove.x;
      enemyChar.posY = chosenMove.y;
      characterPositions[`${enemyChar.posX},${enemyChar.posY}`] = enemyChar.id;
      logToBattleLog(
        `✦이동✦ ${enemyChar.name}, (${oldX},${oldY})에서 (${enemyChar.posX},${enemyChar.posY})(으)로 이동.`
      );
    }
  }

  if (enemyPreviewAction && enemyPreviewAction.casterId === enemyChar.id) {
    if (enemyPreviewAction.skillId.startsWith("GIMMICK_Aegis_of_Earth")) {
      enemyChar.activeGimmick = enemyPreviewAction.skillId;
      console.log(
        `[DEBUG] performEnemyAction: ${enemyChar.name}에게 [${enemyChar.activeGimmick}] 활성화됨.`
      );
    } else {
      const allSkills = { ...SKILLS, ...MONSTER_SKILLS };
      const skillToExecute =
        allSkills[enemyPreviewAction.skillId] ||
        GIMMICK_DATA[enemyPreviewAction.skillId];

      if (skillToExecute && skillToExecute.execute) {
        logToBattleLog(`${enemyChar.name}, [${skillToExecute.name}] 시전.`);
        skillToExecute.execute(
          enemyChar,
          enemyCharacters,
          allyCharacters,
          logToBattleLog,
          enemyPreviewAction.dynamicData
        );
      }
    }
  } else {
    // B-2 보스 '카르나블룸'의 행동 로직
    if (enemyChar.name === "카르나블룸" && enemyChar.type === "천체") {
      if (activeMission && activeMission.casterId === enemyChar.id) {
        logToBattleLog(
          ` ↪︎ ${enemyChar.name}이 배우의 연기를 조용히 지켜봅니다.`
        );
      } else if (
        enemyPreviewAction &&
        enemyPreviewAction.skillId === "GIMMICK_Script_Reversal"
      ) {
        logToBattleLog(`✦공격 실행✦ 예고되었던 공격이 시작됩니다.`);
        const { safeRow, safeCol } = enemyPreviewAction.dynamicData;
        const hitTargets = [];
        const damage = enemyChar.getEffectiveStat("matk");
        allyCharacters.forEach((target) => {
          if (
            target.isAlive &&
            target.posX !== safeCol &&
            target.posY !== safeRow
          ) {
            hitTargets.push(target);
          }
        });
        if (hitTargets.length > 0) {
          const nightmareChance = hitTargets.length * 0.1;
          hitTargets.forEach((target) => {
            target.takeDamage(damage, logToBattleLog, enemyChar);
            if (Math.random() < nightmareChance) {
              target.addDebuff("nightmare", "[악몽]", 99, {
                unremovable: false,
              });
              logToBattleLog(` ↪︎ ${target.name}, 충격으로 [악몽]에 빠집니다.`);
            }
          });
        }
      } else {
        const actionChoice = Math.random();
        if (actionChoice < 0.6) {
          let skillToUseId = null;
          if (playerAttackCountThisTurn >= 14) {
            skillToUseId = "SKILL_Silence";
          } else if (playerAttackCountThisTurn >= 6) {
            skillToUseId = "SKILL_Crimson";
          } else if (playerAttackCountThisTurn >= 0) {
            skillToUseId =
              playerAttackCountThisTurn % 2 === 1
                ? "SKILL_Play1"
                : "SKILL_Play2";
          }
          if (skillToUseId) {
            const skill = MONSTER_SKILLS[skillToUseId];
            logToBattleLog(
              `✦타수 패턴✦ (플레이어 타수: ${playerAttackCountThisTurn}) ${enemyChar.name}, [${skill.name}] 시전.`
            );
            skill.execute(
              enemyChar,
              enemyCharacters,
              allyCharacters,
              logToBattleLog
            );
          }
        } else if (actionChoice < 0.8) {
          logToBattleLog(` ↪︎ ${enemyChar.name}이 다음 막을 준비합니다.`);
        } else {
          const missions = [
            {
              type: "attack",
              name: "웃는 자",
              gimmickId: "GIMMICK_Dress_Rehearsal1",
              filter: (c) => c.job === "딜러",
            },
            {
              type: "support",
              name: "우는 자",
              gimmickId: "GIMMICK_Dress_Rehearsal2",
              filter: (c) => c.job !== "딜러",
            },
            {
              type: "move",
              name: "흥분한 자",
              gimmickId: "GIMMICK_Dress_Rehearsal3",
              filter: (c) => true,
            },
            {
              type: "skip",
              name: "무표정한 자",
              gimmickId: "GIMMICK_Dress_Rehearsal4",
              filter: (c) => true,
            },
          ];
          const mission = missions[Math.floor(Math.random() * missions.length)];
          const validTargets = allyCharacters.filter(
            (c) => c.isAlive && mission.filter(c)
          );
          if (validTargets.length > 0) {
            const target =
              validTargets[Math.floor(Math.random() * validTargets.length)];
            const gimmickScript =
              GIMMICK_DATA[mission.gimmickId]?.script || "대사가 없습니다.";
            logToBattleLog(
              `✦기믹 발동✦ [최종 리허설(${
                mission.name
              })]: ${gimmickScript.replace("(대상 인원의 이름)", target.name)}`
            );
            activeMission = {
              type: mission.type,
              targetCharId: target.id,
              casterId: enemyChar.id,
            };
          }
        }
      }
      // B-1 보스 '카르나블룸'의 행동 로직
    } else if (enemyChar.name === "카르나블룸" && enemyChar.type === "야수") {
      if (currentTurn > 0 && currentTurn % 3 === 0) {
        const skill = MONSTER_SKILLS["SKILL_Thread_of_Emotion"];
        logToBattleLog(skill.script);
        skill.execute(
          enemyChar,
          enemyCharacters,
          allyCharacters,
          logToBattleLog
        );
      } else {
        const aliveAllies = allyCharacters.filter((a) => a.isAlive);
        if (aliveAllies.length > 0) {
          const targetAlly = aliveAllies.reduce(
            (minChar, currentChar) =>
              currentChar.currentHp < minChar.currentHp ? currentChar : minChar,
            aliveAllies[0]
          );
          logToBattleLog(
            `✦정보✦ ${enemyChar.name}, ${targetAlly.name}에게 기본 공격.`
          );
          const damage = calculateDamage(
            enemyChar,
            targetAlly,
            1.0,
            "physical"
          );
          targetAlly.takeDamage(damage, logToBattleLog, enemyChar);
        } else {
          logToBattleLog(`✦정보✦ ${enemyChar.name}: 공격할 대상이 없습니다.`);
        }
      }
      // 그 외 모든 몬스터의 기본 공격 로직
    } else {
      const aliveAllies = allyCharacters.filter((a) => a.isAlive);
      if (aliveAllies.length > 0) {
        const targetAlly =
          aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
        logToBattleLog(
          `✦정보✦ ${enemyChar.name}, ${targetAlly.name}에게 기본 공격.`
        );
        const damage = calculateDamage(
          enemyChar,
          targetAlly,
          1.0,
          enemyChar.atk >= enemyChar.matk ? "physical" : "magical"
        );
        targetAlly.takeDamage(damage, logToBattleLog, enemyChar);
      } else {
        logToBattleLog(`✦정보✦ ${enemyChar.name}: 공격할 대상이 없습니다.`);
      }
    }
  }

  processEndOfTurnEffects(enemyChar);
  return checkBattleEnd();
}

function checkBattleEnd() {
  const allEnemiesDead = enemyCharacters.every((char) => !char.isAlive);
  const allAlliesDead = allyCharacters.every((char) => !char.isAlive);

  if (enemyCharacters.length > 0 && allEnemiesDead) {
    logToBattleLog("--- 모든 적을 물리쳤습니다. 전투 승리.  ---");
    endBattle();
    return true;
  } else if (allyCharacters.length > 0 && allAlliesDead) {
    logToBattleLog("--- 모든 아군이 쓰러졌습니다. 전투 패배.  ---");
    endBattle();
    return true;
  }
  return false;
}

function endBattle() {
  isBattleStarted = false;
  logToBattleLog("=== 전투 종료 ===");

  if (startButton) startButton.style.display = "block";
  if (executeTurnButton) executeTurnButton.style.display = "none";
  if (skillSelectionArea) skillSelectionArea.style.display = "none";
  if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = "none";

  currentTurn = 0;
  playerActionsQueue = [];
  actedAlliesThisTurn = [];

  enemyPreviewAction = null;
}

function findCharacterById(id) {
  return [...allyCharacters, ...enemyCharacters, ...mapObjects].find(
    (char) => char.id === id
  );
}

// 힐링 전용 함수 (탱커 효과 적용 위함)
function applyHeal(target, baseHealAmount, logFn, sourceName = "회복") {
  let finalHeal = baseHealAmount;
  if (
    target.job === "탱커" &&
    target.isAlive &&
    target.currentHp <= target.maxHp * 0.2
  ) {
    finalHeal = Math.round(baseHealAmount * 1.05);
    logFn(`✦직군 효과(탱커)✦ [불굴의 맹세] 발동. 받는 치유량이 5% 증가합니다.`);
  }

  target.currentHp = Math.min(target.maxHp, target.currentHp + finalHeal);
  logFn(
    `✦회복✦ ${target.name}, [${sourceName}] 효과: 체력 ${finalHeal.toFixed(
      0
    )} 회복. (HP: ${target.currentHp.toFixed(0)})`
  );
}

// 주변 적을 찾는 헬퍼 함수 (서포터 효과 적용 위함)
function findAdjacentEnemies(character) {
  const adjacentEnemies = [];
  const offsets = [
    { dx: -1, dy: -1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 1 },
    { dx: 0, dy: 1 },
    { dx: 1, dy: 1 },
  ];

  offsets.forEach((offset) => {
    const adjX = character.posX + offset.dx;
    const adjY = character.posY + offset.dy;
    const targetId = characterPositions[`${adjX},${adjY}`];
    if (targetId) {
      const target = findCharacterById(targetId);
      if (target && enemyCharacters.includes(target) && target.isAlive) {
        adjacentEnemies.push(target);
      }
    }
  });
  return adjacentEnemies;
}

function resolveMinionGimmicks() {
  const livingClowns = enemyCharacters.filter(
    (e) => e.isAlive && e.name === "클라운"
  );
  const livingPierrots = enemyCharacters.filter(
    (e) => e.isAlive && e.name === "피에로"
  );
  const boss = enemyCharacters.find(
    (e) => e.name === "카르나블룸" && e.isAlive
  );

  if (!boss) return; // 보스가 없으면 기믹도 없음

  // --- 앵콜(Encore) 기믹 로직 ---
  if (livingClowns.length === 0 && livingPierrots.length === 0) {
    if (minionsWipedOutTurn === 0) {
      // 쫄병이 바로 이번 턴에 전멸했다면
      minionsWipedOutTurn = currentTurn;
      logToBattleLog(
        "✦정보✦ 모든 인형이 쓰러졌습니다. 인형사가 동요하기 시작합니다."
      );
    }
  }

  // 쫄병이 전멸한 지 2턴이 지났고, 아직 앵콜 기믹이 발동 안했다면
  if (minionsWipedOutTurn > 0 && currentTurn >= minionsWipedOutTurn + 2) {
    logToBattleLog(
      '✦기믹 발동✦ [앵콜]: "나의 아이들은 아직 무대를 떠날 준비가 되지 않은 모양이야."'
    );

    // 보스 체력 20% 회복
    const healAmount = Math.round(boss.maxHp * 0.2);
    applyHeal(boss, healAmount, logToBattleLog, "앵콜");

    // 클라운, 삐에로 1마리씩 소환 (빈 자리를 찾아 소환)
    const clownCell = getRandomEmptyCell();
    if (clownCell) summonMonsterAt("Clown", clownCell);
    const pierrotCell = getRandomEmptyCell();
    if (pierrotCell) summonMonsterAt("Pierrot", pierrotCell);

    // 아군 3명에게 [악몽] 부여
    const livingAllies = allyCharacters.filter((a) => a.isAlive);
    for (let i = 0; i < 3 && livingAllies.length > 0; i++) {
      const randomAllyIndex = Math.floor(Math.random() * livingAllies.length);
      const targetAlly = livingAllies.splice(randomAllyIndex, 1)[0];
      targetAlly.addDebuff("nightmare", "[악몽]", 99, { unremovable: false });
      logToBattleLog(
        ` ↪︎ ${targetAlly.name}, [앵콜]의 저주로 [악몽]에 빠집니다.`
      );
    }

    minionsWipedOutTurn = 0; // 기믹 발동 후 초기화
  }

  // --- 이중창(Duet) 기믹 로직 ---
  const isDuetCondition =
    (livingClowns.length === 0 && livingPierrots.length > 0) ||
    (livingClowns.length > 0 && livingPierrots.length === 0);

  if (isDuetCondition) {
    if (!duetState.isConditionMet) {
      // 이중창 조건이 이번 턴에 처음 만족되었다면
      duetState.isConditionMet = true;
      duetState.turnConditionFirstMet = currentTurn;
      logToBattleLog(
        "✦정보✦ 무대에 한 종류의 인형만 남아 외로운 분위기가 감돕니다."
      );
    }
  } else {
    duetState.isConditionMet = false; // 조건이 깨지면 초기화
  }

  // 이중창 조건이 만족된 상태로 다음 턴이 시작되었다면
  if (
    duetState.isConditionMet &&
    currentTurn > duetState.turnConditionFirstMet
  ) {
    logToBattleLog("✦기믹 발동✦ 남겨진 인형들이 외로움에 폭주합니다.");
    const remainingMinions = [...livingClowns, ...livingPierrots];
    remainingMinions.forEach((minion) => {
      if (!minion.hasBuff("duet_enrage")) {
        // 아직 폭주 상태가 아니라면
        minion.name = `외로운 ${minion.name}`;
        minion.addBuff("duet_enrage", "[폭주]", 99, {}); // 폭주 버프 부여
      }
    });
    duetState.isConditionMet = false; // 기믹 발동 후 초기화
  }
}

// --- 6. 페이지 로드 시 초기화 ---
document.addEventListener("DOMContentLoaded", () => {
  displayCharacters();
  if (startButton) startButton.style.display = "block";
  if (executeTurnButton) executeTurnButton.style.display = "none";
  if (skillSelectionArea) skillSelectionArea.style.display = "none";
  if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = "none";
});

// =================================================================
// ===== 플레이어 관전 페이지 연동을 위한 코드 =====
// =================================================================

/*현재 게임 상태를 localStorage에 저장하여 플레이어 뷰와 공유*/
function updatePlayerView() {
  // 적군 정보에서 스탯과 체력 정보를 제거한 안전한 목록 생성
  const sanitizedEnemies = enemyCharacters.map((enemy) => {
    return {
      id: enemy.id,
      name: enemy.name,
      type: enemy.type,
      isAlive: enemy.isAlive,
      buffs: enemy.buffs,
      debuffs: enemy.debuffs,
      posX: enemy.posX,
      posY: enemy.posY,
      // maxHp, currentHp, atk, matk, def, mdef 등 민감 정보는 제외
    };
  });

  // 공유할 게임 상태 객체
  const gameState = {
    allies: allyCharacters,
    enemies: sanitizedEnemies,
    mapObjects: mapObjects,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    battleLog: getElement("battleLog").innerHTML,
    enemyPreviewAction: enemyPreviewAction, // 적의 다음 행동 예고 정보
  };

  try {
    // 객체를 JSON 문자열로 변환하여 localStorage에 저장
    localStorage.setItem("raidSimulatorState", JSON.stringify(gameState));
  } catch (e) {
    console.error("localStorage 저장 실패:", e);
  }
}

window.loadSelectedMap = loadSelectedMap;
window.updatePlayerView = updatePlayerView;
window.addCharacter = addCharacter;
window.deleteCharacter = deleteCharacter;
window.startBattle = startBattle;
window.executeBattleTurn = executeBattleTurn;
window.confirmAction = confirmAction;
