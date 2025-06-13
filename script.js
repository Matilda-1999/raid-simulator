// --- 0. 상수 정의 ---
const MAP_WIDTH = 5;
const MAP_HEIGHT = 5;

const SKILLS = {
    // [근성]
    SKILL_RESILIENCE: {
        id: "SKILL_RESILIENCE",
        name: "근성",
        type: "어그로",
        description: "원래 연극은 대사를 고르게 나누지 않는다. … 잠깐. 또 너야?<br><br>홀수 턴에는 [철옹성]을, 짝수 턴에는 [의지]를 획득. <br><br>[철옹성]: (자신에게 현재 체력의 2배 + 방어력 2배)만큼의 보호막 부여. 해당 턴에 발생한 모든 아군의 감소한 체력을 대신 감소. 3턴 유지. <br>[의지]: 자신에게 (해당 전투에서 시전 턴까지 받은 대미지의 총 합 * 2.5배)만큼의 보호막을 부여. 이후 [의지] 버프가 해제될 때에 남아 있는 보호막만큼을 자신의 체력으로 흡수. 3턴 유지. 단, [의지] 버프가 해제되면 그동안 받은 대미지의 총합을 초기화.",
        targetType: "self",
        targetSelection: "self",
        execute: (caster, allies, enemies, battleLog) => {
            if (currentTurn % 2 === 1) { // 홀수 턴: 철옹성
                const shieldAmount = caster.currentHp * 2.0 + caster.def * 2.0;
                // caster.shield += shieldAmount; // 보호막은 addBuff를 통해 관리
                caster.removeBuffById('iron_fortress'); 
                caster.addBuff('iron_fortress', '[철옹성]', 3, {
                    description: "자신에게 보호막 부여. 3턴간 아군 피해 대신 받음.",
                    shieldAmount: shieldAmount, // 이 버프가 제공하는 보호막 양
                    redirectAllyDamage: true 
                });
                battleLog(`✦스킬✦ ${caster.name}, [근성](홀수) 사용: [철옹성] 효과 발동. 보호막 +${shieldAmount.toFixed(0)} (3턴). (현재 총 보호막: ${caster.shield.toFixed(0)})`);
            } else { // 짝수 턴: 의지
                const damageTaken = caster.totalDamageTakenThisBattle;
                const shieldAmount = damageTaken * 2.5;
                // caster.shield += shieldAmount; // 보호막은 addBuff를 통해 관리
                caster.removeBuffById('will_buff');
                caster.addBuff('will_buff', '[의지]', 3, {
                    description: "받은 총 피해 비례 보호막. 해제 시 남은 보호막만큼 체력 흡수 및 받은 피해 총합 초기화.",
                    shieldAmount: shieldAmount, // 이 버프가 제공하는 보호막 양
                    healOnRemove: true, 
                    resetsTotalDamageTaken: true 
                });
                battleLog(`✦스킬✦ ${caster.name}, [근성](짝수) 사용: [의지] 효과 발동. (받은 피해: ${damageTaken.toFixed(0)}) 보호막 +${shieldAmount.toFixed(0)} (3턴). (현재 총 보호막: ${caster.shield.toFixed(0)})`);
            }
            return true;
        }
    },
    // [반격]
    SKILL_COUNTER: {
        id: "SKILL_COUNTER",
        name: "반격",
        type: "카운터",
        description: "출연 기회는 모두에게 주어진다. 관객 없는 무대는 놀랍도록 관대하니까.<br><br>쿨타임 1턴. [반격]이 홀수 턴에는 [응수], 짝수 턴에는 [격노]로 발동. <br><br>[응수]: 해당 보호막 최대 2턴 유지. 자신이 지닌 보호막을 모든 아군에게 균등하게 나눔. 해당 턴에 자신이 공격받는다면, 가장 체력이 높은 적군(단일)에게 (받는 피해)x1.5 피해. 아군이 공격받는다면, 가장 체력이 낮은 적군(단일)에게 (받는 피해)x.0.5 피해. 만약 적군의 체력이 동일하다면, 대상 중 랜덤 피해. <br>[격노]: 해당 보호막 최대 2턴 유지. 자신이 지닌 보호막을 모든 아군에게 균등하게 나눔. 해당 턴에 자신이 공격받는다면, 모든 적군에게 (받는 피해)x1.5 피해. 아군이 공격받는다면, 모든 적군에게 (받는 피해)x0.5 피해.",
        targetType: "self",
        targetSelection: "self",
        cooldown: 2, // 사용 후 1턴간 사용 불가 (2턴째부터 사용 가능)
        execute: (caster, allies, enemies, battleLog) => {
            const skillName = SKILLS.SKILL_COUNTER.name;

            // 쿨타임 확인
            const lastUsed = caster.lastSkillTurn[SKILLS.SKILL_COUNTER.id] || 0;
            if (lastUsed !== 0 && currentTurn - lastUsed < SKILLS.SKILL_COUNTER.cooldown) {
                battleLog(`✦정보✦ ${caster.name}, [${skillName}] 사용 불가: 쿨타임 ${SKILLS.SKILL_COUNTER.cooldown - (currentTurn - lastUsed)}턴 남음.`);
                return false;
            }

            const baseShieldAmountFromCaster = caster.shield; 

            if (baseShieldAmountFromCaster > 0) {
                const allLivingAlliesIncludingCaster = allies.filter(a => a.isAlive);
                if (allLivingAlliesIncludingCaster.length > 0) {
                    const shieldPerAlly = baseShieldAmountFromCaster / allLivingAlliesIncludingCaster.length;
                    battleLog(`✦효과✦ ${caster.name}, [${skillName}]의 보호막 분배: 자신의 보호막(${baseShieldAmountFromCaster.toFixed(0)}) 기반으로 아군 ${allLivingAlliesIncludingCaster.length}명에게 2턴 보호막 버프 부여.`);
                    allLivingAlliesIncludingCaster.forEach(ally => {
                        const buffId = `counter_shield_${caster.id}_to_${ally.id}_${currentTurn}`; // 턴정보 추가로 ID 유니크성 강화
                        ally.addBuff(
                            buffId,
                            '[반격 보호막]',
                            2,
                            { shieldAmount: shieldPerAlly }
                        );
                        // addBuff에서 로그를 찍으므로 여기서는 생략하거나 요약 로그만 남김
                        // battleLog(`  ✦보호막 버프✦ ${ally.name}: [반격 보호막] +${shieldPerAlly.toFixed(0)} (2턴). (현재 총 보호막: ${ally.shield.toFixed(0)})`);
                    });
                    caster.shield = 0; 
                } else {
                     battleLog(`✦정보✦ ${caster.name}, [${skillName}] 보호막 분배: 대상 아군 없음.`);
                }
            } else {
                battleLog(`✦정보✦ ${caster.name}, [${skillName}] 보호막 분배: 나눌 보호막 없음.`);
            }

            if (currentTurn % 2 === 1) { // 홀수 턴: 응수
                caster.removeBuffById('riposte_stance'); 
                caster.removeBuffById('fury_stance');   
                caster.addBuff('riposte_stance', '[응수]', 1, { 
                    description: "자신 피격 시 가장 체력 높은 적 단일 반격(1.5배), 아군 피격 시 가장 체력 낮은 적 단일 반격(0.5배)."
                });
                battleLog(`✦스킬✦ ${caster.name}, [반격](홀수) 사용: [응수] 태세 돌입. (1턴)`);
            } else { // 짝수 턴: 격노
                caster.removeBuffById('fury_stance');  
                caster.removeBuffById('riposte_stance'); 
                caster.addBuff('fury_stance', '[격노]', 2, { 
                    description: "자신 피격 시 모든 적 반격(1.5배), 아군 피격 시 모든 적 반격(0.5배)."
                });
                battleLog(`✦스킬✦ ${caster.name}, [반격](짝수) 사용: [격노] 태세 돌입. (2턴)`);
            }
            caster.lastSkillTurn[SKILLS.SKILL_COUNTER.id] = currentTurn; // 성공 시 쿨타임 기록
            return true;
        }
    },
    // [도발]
    SKILL_PROVOKE: {
        id: "SKILL_PROVOKE",
        name: "도발",
        type: "어그로",
        description: "주인공이 여기에 있다. 자, 이제 대사를 날리자. 관객들이 지루해하기 전에.<br><br>해당 턴에 자신의 받는 피해 0.3으로 감소. 다음 적군 턴 동안 모든 적군은 자신만을 대상으로 공격. 해당 턴에 자신의 감소한 체력 총합 저장.",
        targetType: "self",
        targetSelection: "self",
        execute: (caster, allies, enemies, battleLog) => {
            caster.addBuff('provoke_damage_reduction', '피해 감소 (도발)', 1, { damageReduction: 0.7 });
            enemies.filter(e => e.isAlive).forEach(enemy => {
                enemy.addDebuff('provoked', '도발 (타겟 고정)', 2, { targetId: caster.id }); // 도발은 적에게 거는 디버프
            });
            caster.aggroDamageStored = 0; // 이 스킬 사용 시 저장된 피해량은 초기화 (새로 저장 시작)
            battleLog(`✦효과✦ ${caster.name}, [도발] 사용: 모든 적을 도발하며, 자신은 받는 피해가 감소합니다.`);
            return true;
        }
    },
    // [역습]
    SKILL_REVERSAL: {
        id: "SKILL_REVERSAL",
        name: "역습",
        type: "카운터",
        description: "타이밍은 대사가 아니다. 하지만 좋은 대사는 늘 제때에 맞는다.<br><br>자신의 현재 체력 0.5로 감소. <br>해당 턴에 자신이 공격받은 후, 홀수 턴에는 (공격력 + [도발] 저장 피해)x1.5 물리 피해. <br>짝수 턴에는 (마법 공격력 + [도발] 저장 피해)x1.5 마법 피해를 공격한 적군에게 줌. <br>반격 후, 도발 저장량 초기화. (쿨타임 2턴)",
        targetType: "self",
        targetSelection: "self",
        cooldown: 2, // 사용 후 1턴간 사용 불가
        execute: (caster, allies, enemies, battleLog) => {
            // 쿨타임 확인
            const lastUsed = caster.lastSkillTurn[SKILLS.SKILL_REVERSAL.id] || 0;
            if (lastUsed !== 0 && currentTurn - lastUsed < SKILLS.SKILL_REVERSAL.cooldown) {
                battleLog(`✦정보✦ ${caster.name}, [역습] 사용 불가: 쿨타임 ${SKILLS.SKILL_REVERSAL.cooldown - (currentTurn - lastUsed)}턴 남음.`);
                return false;
            }

            const hpLoss = caster.currentHp * 0.5;
            caster.currentHp -= hpLoss;
            if (caster.currentHp < 1) caster.currentHp = 1; // 최소 체력 1
            battleLog(`✦소모✦ ${caster.name}, [역습] 사용 준비: 체력 ${hpLoss.toFixed(0)} 소모. (현재 HP: ${caster.currentHp.toFixed(0)})`);
            caster.addBuff('reversal_active', '역습 대기', 1, {
                 // 도발 저장 피해는 reversal_active 버프 효과보다는, 피격 시점에 caster.aggroDamageStored를 직접 참조
            });
            caster.lastSkillTurn[SKILLS.SKILL_REVERSAL.id] = currentTurn; // 성공 시 쿨타임 기록
            return true;
        }
    },
    // [허상]
    SKILL_ILLUSION: {
        id: "SKILL_ILLUSION",
        name: "허상",
        type: "지정 버프",
        description: "무엇을 찾으려 했는가. 애초에 목적을 알고 있었는가?<br><br>단일 강화. 자신에게 사용 시 (공격)x0.5 체력 회복. 다른 아군에게 사용 시 자신의 (공격)x0.2 체력 잃고 아군 (공격)x2.0 증가(2턴). <br>턴 종료 시 목표 적군에게 (공격)x0.5 추가 공격.",
        targetType: "single_ally_or_self",
        targetSelection: "ally_or_self",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) {
                battleLog(`✦정보✦ ${caster.name} [허상]: 스킬 대상을 찾을 수 없습니다.`);
                return false;
            }
            if (caster.id === target.id) { // 자신에게 사용
                const healAmount = caster.getEffectiveStat('atk') * 0.5; // getEffectiveStat 사용
                caster.currentHp = Math.min(caster.maxHp, caster.currentHp + healAmount);
                battleLog(`✦회복✦ ${caster.name}, [허상] 사용 (자신): 체력 ${healAmount.toFixed(0)} 회복. (HP: ${caster.currentHp.toFixed(0)})`);
            } else { // 다른 아군에게 사용
                const hpLoss = caster.getEffectiveStat('atk') * 0.2;
                caster.currentHp -= hpLoss;
                if (caster.currentHp < 1) caster.currentHp = 1;
                battleLog(`✦소모✦ ${caster.name}, [허상] 사용 (${target.name} 대상): 체력 ${hpLoss.toFixed(0)} 소모. (HP: ${caster.currentHp.toFixed(0)})`);
                
                target.addBuff('illusion_atk_boost', '공격력 증가 (허상)', 2, { 
                    type: 'atk_boost_multiplier', // Character.getEffectiveStat 에서 참조할 타입
                    value: 2.0 // 공격력 2배
                 });
                battleLog(`✦버프✦ ${target.name}: [허상 효과] 공격력 2배 증가 (2턴).`);
            }
            // 턴 종료 시 추가 공격 로직 (가장 처음 살아 있는 적 대상)
            const firstAliveEnemy = enemies.find(e => e.isAlive);
            if (firstAliveEnemy) {
                 caster.addBuff('illusion_end_turn_attack', '턴 종료 추가 공격 (허상)', 1, { 
                     attackerId: caster.id, 
                     originalTargetId: target.id, // 허상 스킬의 원래 대상 (자신 또는 아군)
                     enemyTargetId: firstAliveEnemy.id,
                     power: 0.5, // 공격력의 0.5배
                     damageType: 'physical' // 예시: 물리 피해
                 });
            } else {
                battleLog(`✦정보✦ ${caster.name} [허상]: 턴 종료 추가 공격 대상을 찾을 수 없습니다.`);
            }
            return true;
        }
    },
    // [허무]
    SKILL_NIHILITY: {
        id: "SKILL_NIHILITY",
        name: "허무",
        type: "지정 버프",
        description: "실재하지 않는 이상에 도달하려 한 자의 잔상이다.<br><br>단일 강화. 목표 아군의 [상태 이상], [제어], [속성 감소] 랜덤 2개 정화. [버프 집합] 중 랜덤 1개 부여(2턴).",
        targetType: "single_ally",
        targetSelection: "ally",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) {
                battleLog(`✦정보✦ ${caster.name} [허무]: 스킬 대상을 찾을 수 없습니다.`);
                return false;
            }
            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [허무] 사용: 디버프 정화 및 랜덤 버프 부여.`);
            
            // 디버프 정화 로직 (기존 유지)
            const removableDebuffs = target.debuffs.filter(d => ['상태 이상', '제어', '속성 감소'].includes(d.effect.category || '기타'));
            let removedCount = 0;
            // Fisher-Yates shuffle 로 랜덤 선택
            for (let i = removableDebuffs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [removableDebuffs[i], removableDebuffs[j]] = [removableDebuffs[j], removableDebuffs[i]];
            }
            for (let i = 0; i < Math.min(2, removableDebuffs.length); i++) {
                const debuffToRemove = removableDebuffs[i];
                target.removeDebuffById(debuffToRemove.id); // removeDebuffById는 Character 클래스에 정의 필요
                battleLog(`✦정화✦ ${target.name}: [${debuffToRemove.name}] 디버프 정화됨.`);
                removedCount++;
            }
            if (removedCount === 0 && removableDebuffs.length > 0) { // 정화할 디버프는 있었으나 0개 정화된 경우(로직오류 가능성) - 실제로는 min(2, length)로 인해 거의 발생 안함
                 battleLog(`✦정보✦ ${target.name}: 정화할 수 있는 디버프가 없습니다(선택실패).`);
            } else if (removableDebuffs.length === 0) {
                 battleLog(`✦정보✦ ${target.name}: 정화할 수 있는 디버프가 없습니다.`);
            }


            // 랜덤 버프 부여 로직 (기존 유지)
            const buffChoices = [
                { id: 'nihility_heal_hot', name: '턴 시작 시 HP 회복 (허무)', turns: 2, effect: { type: 'turn_start_heal', value: caster.getEffectiveStat('atk') * 0.5 } },
                { id: 'nihility_reflect_dmg', name: '피해 반사 (허무)', turns: 2, effect: { type: 'damage_reflect', value: 0.3 } }, // 30% 반사
                { id: 'nihility_def_boost', name: '방어력 증가 (허무)', turns: 2, effect: { type: 'def_boost_multiplier', value: 1.3 } }, // 30% 증가 -> 1.3배
                { id: 'nihility_atk_boost', name: '공격력 증가 (허무)', turns: 2, effect: { type: 'atk_boost_multiplier', value: 1.5 } }  // 50% 증가 -> 1.5배
            ];
            const chosenBuffData = buffChoices[Math.floor(Math.random() * buffChoices.length)];
            target.addBuff(chosenBuffData.id, chosenBuffData.name, chosenBuffData.turns, chosenBuffData.effect);
            battleLog(`✦버프✦ ${target.name}: [허무 효과] [${chosenBuffData.name}] 획득 (2턴).`);
            return true;
        }
    },
    // [실존]
    SKILL_REALITY: {
        id: "SKILL_REALITY",
        name: "실존",
        type: "광역 버프",
        description: "보아라, 눈앞에 놓여진 것을. 그리고 말하라, 당신이 깨달은 것을.<br><br>모든 아군 방어력 x0.3 증가 (2턴). <br>자신은 [실재] 4스택 추가 획득 (2턴, 해제 불가). <br>연속 사용 시 추가 2스택 획득. (쿨타임 2턴)",
        targetType: "all_allies", // 자신 포함 모든 아군
        targetSelection: "all_allies", // UI에서 전체 선택으로 처리
        cooldown: 3, 
        execute: (caster, allies, enemies, battleLog) => {
            const currentTurnNum = currentTurn;
            const lastUsedTurn = caster.lastSkillTurn[SKILLS.SKILL_REALITY.id] || 0;

            if (lastUsedTurn !== 0 && currentTurnNum - lastUsedTurn < SKILLS.SKILL_REALITY.cooldown) {
                 battleLog(`✦정보✦ ${caster.name}, [실존] 사용 불가: 쿨타임 ${SKILLS.SKILL_REALITY.cooldown - (currentTurnNum - lastUsedTurn)}턴 남음.`);
                 return false;
            }
            battleLog(`✦스킬✦ ${caster.name}, [실존] 사용: 모든 아군 방어력 증가 및 자신에게 [실재] 스택 부여.`);
            
            allies.filter(a => a.isAlive).forEach(ally => {
                ally.addBuff('reality_def_boost', '방어력 증가 (실존)', 2, { 
                    type: 'def_boost_multiplier', // Character.getEffectiveStat 에서 참조
                    value: 1.3 // 30% 증가
                });
            });
            battleLog(`✦버프✦ 모든 아군: 방어력 30% 증가 (2턴).`);

            // [실재] 스택 로직 (연속 사용 시 추가 스택은 lastSkillTurn을 좀 더 활용해야 함)
            let realityStacksToAdd = 4;
            const realityBuff = caster.buffs.find(b => b.id === 'reality_stacks');
            if (realityBuff && realityBuff.lastAppliedTurn === currentTurnNum -1) { // 직전 턴에 실재 버프가 적용되었다면 (연속사용 간주)
                 realityStacksToAdd +=2;
                 battleLog(`✦효과✦ ${caster.name} [실존] 연속 사용: [실재] 추가 2스택.`);
            }

            // addBuff 스택 로직이 기존 스택에 더하는 형태여야 함
            caster.addBuff('reality_stacks', '[실재]', 2, { // 2턴 지속, 해제 불가
                atkBoostPerStack: 0.4, // 스택당 공격력/마법공격력 40% 증가 (기본 스탯 비례)
                matkBoostPerStack: 0.4, // 마법 공격력도 동일하게
                stacks: realityStacksToAdd, 
                unremovable: true,
                lastAppliedTurn: currentTurnNum // 연속 사용 체크를 위해 마지막 적용 턴 기록
            }, true); // true는 스택을 누적하라는 의미 (addBuff 수정 필요)


            const currentRealityStacks = caster.buffs.find(b => b.id === 'reality_stacks')?.stacks || 0;
            battleLog(`✦버프✦ ${caster.name}: [실재] ${realityStacksToAdd}스택 추가 획득 (현재 ${currentRealityStacks}스택, 2턴, 해제 불가).`);
            
            caster.lastSkillTurn[SKILLS.SKILL_REALITY.id] = currentTurnNum;
            return true;
        }
    },
    // [진리]
    SKILL_TRUTH: {
        id: "SKILL_TRUTH",
        name: "진리",
        type: "광역 디버프",
        description: "아래는 진창이었음을. 드디어 깨달은 당신에게 선사하는 아름다운 정론이다.<br><br>모든 적군에게 2턴 동안 [중독] 상태 부여 (턴 종료 시 사용자의 (공격력+마법공격력)/2 x0.5 고정 피해). <br>중독 결산 후 랜덤 적군에게 사용자의 (공격력+마법공격력)/2 x0.3 추가 공격 부여.",
        targetType: "all_enemies",
        targetSelection: "all_enemies",
        execute: (caster, enemies, battleLog) => { // allies 파라미터는 없어도 됨
            battleLog(`✦스킬✦ ${caster.name}, [진리] 사용: 모든 적에게 [중독]을 부여합니다.`);
            const averageAttack = (caster.getEffectiveStat('atk') + caster.getEffectiveStat('matk')) / 2;
            enemies.filter(e => e.isAlive).forEach(enemy => {
                enemy.addDebuff('poison_truth', '[중독](진리)', 2, { 
                    damagePerTurn: averageAttack * 0.5, 
                    type: 'fixed', // 고정 피해
                    casterId: caster.id, // 피해 출처 명시
                    category: '상태 이상' // 허무 스킬 정화 대상 여부 판단용
                });
                battleLog(`✦상태 이상✦ ${enemy.name}, [중독](진리) 효과 적용 (2턴).`);
            });
            // 턴 종료 추가 공격을 위한 마커 버프
            caster.addBuff('truth_end_turn_attack_marker', '진리 추가 공격 대기', 1, { 
                originalCasterId: caster.id,
                power: 0.3, // (공격력+마법공격력)/2 의 0.3배
                damageBaseStatAverage: true // 표식
            });
            return true;
        }
    },
    // [서막]
    SKILL_OVERTURE: {
        id: "SKILL_OVERTURE",
        name: "서막",
        type: "단일 공격",
        description: "막이 오르면, 파열이 시작된다. <br><br>공격력 200% 물리 피해/마법 공격력 250% 마법 피해를 가하고 상대에게 [흠집]을 새긴다. <br>[흠집]: 기본 2턴, 중첩 시 마지막 흠집 유지 시간에 따름. 3회까지 중첩. 추가 공격 이후 사라짐.",
        targetType: "single_enemy",
        targetSelection: "enemy",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) { battleLog(`✦정보✦ ${caster.name} [서막]: 스킬 대상을 찾을 수 없습니다.`); return false; }
            if (!target.isAlive) { battleLog(`✦정보✦ ${caster.name} [서막]: 대상 ${target.name}은(는) 이미 쓰러져 있습니다.`); return false;}
            
            const damageType = caster.getEffectiveStat('atk') >= caster.getEffectiveStat('matk') ? 'physical' : 'magical';
            const skillPower = damageType === 'physical' ? 2.0 : 2.5;
            const damage = calculateDamage(caster, target, skillPower, damageType);
            target.takeDamage(damage, battleLog, caster);
            battleLog(`✦피해✦ ${caster.name}, [서막]: ${target.name}에게 ${damage.toFixed(0)} ${damageType === 'physical' ? '물리' : '마법'} 피해.`);
            
            // [흠집] 디버프 적용
            target.addDebuff('scratch', '[흠집]', 2, { 
                maxStacks: 3, 
                overrideDuration: true, // 중첩 시 마지막 흠집 유지 시간에 따름 (addDebuff에서 처리)
                removerSkillId: SKILLS.SKILL_CLIMAX.id, // 이 스킬로 제거됨을 명시 (선택적)
                category: '표식' // 예시 카테고리
            });
            const scratchStacks = target.getDebuffStacks('scratch');
            battleLog(`✦디버프✦ ${target.name}, [흠집] 효과 적용 (현재 ${scratchStacks}스택).`);
            return true;
        }
    },
     // [절정]
    SKILL_CLIMAX: {
        id: "SKILL_CLIMAX",
        name: "절정",
        type: "단일 공격",
        description: "모든 장면은 이 순간을 위해 준비된다.<br><br>시전자의 타입에 따라 공격력 또는 마법 공격력의 270% 피해. 이후 상대에게 새겨진 [흠집] 수에 따라 각각 공격력/마법 공격력의 25%(1개)/35%(2개)/45%(3개) 추가 공격 2회. [흠집]은 추가 공격 후 소멸.",
        targetType: "single_enemy",
        targetSelection: "enemy",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) { battleLog(`✦정보✦ ${caster.name} [절정]: 스킬 대상을 찾을 수 없습니다.`); return false; }
            if (!target.isAlive) { battleLog(`✦정보✦ ${caster.name} [절정]: 대상 ${target.name}은(는) 이미 쓰러져 있습니다.`); return false; }

            let statTypeToUse; // 'atk' 또는 'matk'
            let damageType; // 'physical' 또는 'magical'

            // 시전자 타입에 따른 주 스탯 및 데미지 타입 결정
            if (caster.type === "암석" || caster.type === "야수") {
                statTypeToUse = 'atk';
                damageType = 'physical';
            } else if (caster.type === "천체" || caster.type === "나무") {
                statTypeToUse = 'matk';
                damageType = 'magical';
            } else { // 예외 처리 (기본 스탯 높은 쪽으로)
                statTypeToUse = caster.getEffectiveStat('atk') >= caster.getEffectiveStat('matk') ? 'atk' : 'matk';
                damageType = statTypeToUse === 'atk' ? 'physical' : 'magical';
            }
            const damageTypeKorean = damageType === 'physical' ? '물리' : '마법';

            // 주 공격
            const mainSkillPower = 2.7; // 270%
            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [절정] 공격.`);
            const mainDamage = calculateDamage(caster, target, mainSkillPower, damageType, statTypeToUse);
            target.takeDamage(mainDamage, battleLog, caster);
            battleLog(`  ✦피해✦ [절정]: ${target.name}에게 ${mainDamage.toFixed(0)} ${damageTypeKorean} 피해.`);

            if (!target.isAlive) return true; // 주 공격으로 대상 사망 시 종료

            // [흠집] 스택 기반 추가 공격
            const scratchStacks = target.getDebuffStacks('scratch');
            if (scratchStacks > 0) {
                battleLog(`✦효과✦ ${target.name} [흠집 ${scratchStacks}스택]: 추가타 발생.`);
                let bonusSkillPowerPercent = 0;
                if (scratchStacks === 1) bonusSkillPowerPercent = 0.25;
                else if (scratchStacks === 2) bonusSkillPowerPercent = 0.35;
                else if (scratchStacks >= 3) bonusSkillPowerPercent = 0.45;

                for (let i = 0; i < 2; i++) { // 2회 추가 공격
                    const bonusDamage = calculateDamage(caster, target, bonusSkillPowerPercent, damageType, statTypeToUse);
                    target.takeDamage(bonusDamage, battleLog, caster);
                    battleLog(`  ✦추가 피해✦ [흠집 효과] ${i + 1}회: ${target.name}에게 ${bonusDamage.toFixed(0)} 추가 ${damageTypeKorean} 피해.`);
                    if (!target.isAlive) break; // 추가 공격 중 대상 사망 시 중단
                }

                // 모든 추가 공격 후 [흠집] 제거
                if (target.isAlive) target.removeDebuffById('scratch');
                battleLog(`✦정보✦ ${target.name}: [흠집] 효과 소멸.`);
            }
            return true;
        }
    },
    // [간파]
    SKILL_DISCERNMENT: {
        id: "SKILL_DISCERNMENT",
        name: "간파",
        type: "단일 공격",
        description: "숨죽인 무대에는 벌어질 틈이 감춰져 있다.<br><br>공격력 190% 물리/240% 마법 피해 (2타). 이후 공격력 50% 물리/마법 공격력 70% 마법 피해를 가하며 상대에게 [쇠약] 상태 부여. <br>[쇠약]: 지속 2 턴. 공격 시 피해량 -20%.",
        targetType: "single_enemy",
        targetSelection: "enemy",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) { battleLog(`✦정보✦ ${caster.name} [간파]: 스킬 대상을 찾을 수 없습니다.`); return false; }
            if (!target.isAlive) { battleLog(`✦정보✦ ${caster.name} [간파]: 대상 ${target.name}은(는) 이미 쓰러져 있습니다.`); return false;}

            const damageType = caster.getEffectiveStat('atk') >= caster.getEffectiveStat('matk') ? 'physical' : 'magical';
            const damageTypeKorean = damageType === 'physical' ? '물리' : '마법';
            const skillPower1 = damageType === 'physical' ? 1.9 : 2.4; // 2타 총합 계수

            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [간파] 2연타 공격.`);
            for (let i=0; i<2; i++) {
                const damage1 = calculateDamage(caster, target, skillPower1 / 2, damageType); // 1타당 절반 계수
                target.takeDamage(damage1, battleLog, caster);
                battleLog(`  ✦피해✦ [간파] ${i+1}타: ${target.name}에게 ${damage1.toFixed(0)} ${damageTypeKorean} 피해.`);
                if (!target.isAlive) return true;
            }

            // 추가타 및 [쇠약] 부여
            const skillPower2 = damageType === 'physical' ? 0.5 : 0.7;
            const damage2 = calculateDamage(caster, target, skillPower2, damageType);
            target.takeDamage(damage2, battleLog, caster);
            battleLog(`✦추가 피해✦ ${caster.name} [간파 효과]: ${target.name}에게 ${damage2.toFixed(0)} 추가 ${damageTypeKorean} 피해.`);
            if (!target.isAlive) return true;
            
            target.addDebuff('weakness', '[쇠약]', 2, { 
                damageMultiplierReduction: 0.2, // 공격 시 피해량 20% 감소 (calculateDamage에서 이 디버프 확인 필요)
                category: '상태 이상'
            });
            battleLog(`✦상태 이상✦ ${target.name}, [쇠약] 효과 적용 (2턴).`);
            return true;
        }
    },
    // [파열]
    SKILL_RUPTURE: {
        id: "SKILL_RUPTURE",
        name: "파열",
        type: "광역 공격",
        description: "균열은 가장 고요한 순간에 일어난다.<br><br> 시전자 타입 기반 주 목표에게 공/마공 210% 피해, 주 목표 제외 모든 적에게 공/마공 140% 피해. [쇠약] 상태 적에게 적중 시 추가로 공/마공 30% 고정 피해. (쿨타임 2턴)",
        targetType: "single_enemy", // 주 목표 선택, 나머지는 자동 부 목표
        targetSelection: "enemy",
        cooldown: 3, 
        execute: (caster, mainTarget, allies, enemies, battleLog) => { 
            if (!mainTarget) { battleLog(`✦정보✦ ${caster.name} [파열]: 주 대상을 찾을 수 없습니다.`); return false; }
            if (!mainTarget.isAlive) { battleLog(`✦정보✦ ${caster.name} [파열]: 주 대상 ${mainTarget.name}은(는) 이미 쓰러져 있습니다.`); return false;}

            const lastUsed = caster.lastSkillTurn[SKILLS.SKILL_RUPTURE.id] || 0;
            if (lastUsed !== 0 && currentTurn - lastUsed < SKILLS.SKILL_RUPTURE.cooldown) {
                battleLog(`✦정보✦ ${caster.name}, [파열] 사용 불가: 쿨타임 ${SKILLS.SKILL_RUPTURE.cooldown - (currentTurn - lastUsed)}턴 남음.`);
                return false; 
            }

            let statTypeToUse;
            let damageType;
            if (caster.type === "암석" || caster.type === "야수") {
                statTypeToUse = 'atk'; damageType = 'physical';
            } else if (caster.type === "천체" || caster.type === "나무") {
                statTypeToUse = 'matk'; damageType = 'magical';
            } else {
                statTypeToUse = caster.getEffectiveStat('atk') >= caster.getEffectiveStat('matk') ? 'atk' : 'matk';
                damageType = statTypeToUse === 'atk' ? 'physical' : 'magical';
            }
            const damageTypeKorean = damageType === 'physical' ? '물리' : '마법';

            battleLog(`✦스킬✦ ${caster.name}, [파열] 사용. 주 대상: ${mainTarget.name}.`);

            // 주 목표 공격
            const mainSkillPower = 2.1;
            const mainDamage = calculateDamage(caster, mainTarget, mainSkillPower, damageType, statTypeToUse);
            mainTarget.takeDamage(mainDamage, battleLog, caster);
            battleLog(`  ✦피해✦ [파열 주 대상] ${mainTarget.name}: ${mainDamage.toFixed(0)} ${damageTypeKorean} 피해.`);

            if (mainTarget.isAlive && mainTarget.hasDebuff('weakness')) {
                const bonusFixedDamageValue = caster.getEffectiveStat(statTypeToUse) * 0.3;
                const actualBonusFixedDamage = calculateDamage(caster, mainTarget, bonusFixedDamageValue, 'fixed'); // 고정 피해
                mainTarget.takeDamage(actualBonusFixedDamage, battleLog, caster);
                battleLog(`  ✦추가 피해✦ ${mainTarget.name} ([쇠약] 대상): ${actualBonusFixedDamage.toFixed(0)} 추가 고정 피해.`);
            }

            // 부 목표 공격
            const subTargets = enemies.filter(e => e.isAlive && e.id !== mainTarget.id);
            if (subTargets.length > 0) {
                battleLog(`  ✦파열 부가 대상 공격 시작 (총 ${subTargets.length}명)`);
                const subSkillPower = 1.4;
                subTargets.forEach(subTarget => {
                    if (!subTarget.isAlive) return;
                    const subDamage = calculateDamage(caster, subTarget, subSkillPower, damageType, statTypeToUse);
                    subTarget.takeDamage(subDamage, battleLog, caster);
                    battleLog(`    ✦피해✦ [파열 부 대상] ${subTarget.name}: ${subDamage.toFixed(0)} ${damageTypeKorean} 피해.`);

                    if (subTarget.isAlive && subTarget.hasDebuff('weakness')) {
                        const bonusFixedDamageValueSub = caster.getEffectiveStat(statTypeToUse) * 0.3;
                        const actualBonusFixedDamageSub = calculateDamage(caster, subTarget, bonusFixedDamageValueSub, 'fixed');
                        subTarget.takeDamage(actualBonusFixedDamageSub, battleLog, caster);
                        battleLog(`    ✦추가 피해✦ ${subTarget.name} ([쇠약] 대상): ${actualBonusFixedDamageSub.toFixed(0)} 추가 고정 피해.`);
                    }
                });
            }
            caster.lastSkillTurn[SKILLS.SKILL_RUPTURE.id] = currentTurn;
            return true;
        }
    },

        // [공명]
    SKILL_RESONANCE: {
        id: "SKILL_RESONANCE",
        name: "공명",
        type: "지정 버프",
        description: "두 사람의 완벽한 조화는 곧 전체의 완성이다.<br><br>1) 지정 대상이 (잃은 체력x50%) 회복<br>2) 모든 상태 이상 정화<br>3) 시전자 [환원] 상태 진입. <br> [환원] 상태 시,스킬 시전할 때 가장 낮은 체력 아군 (시전자 방어력x60%) 추가 회복 3턴 지속, 연달아 사용하더라도 최대 3턴",
        targetType: "single_ally",
        targetSelection: "ally",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target || !target.isAlive) {
                battleLog(`✦정보✦ ${caster.name} [공명]: 대상을 찾을 수 없거나 대상이 쓰러져 있습니다.`);
                return false;
            }
            
            // 1. 잃은 체력 비례 회복
            const lostHp = target.maxHp - target.currentHp;
            const healAmount = lostHp * 0.5;
            target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [공명] 사용!`);
            battleLog(`✦회복✦ ${target.name}: 체력 ${healAmount.toFixed(0)} 회복. (HP: ${target.currentHp.toFixed(0)})`);

            // 2. 모든 상태 이상 정화
            if (target.debuffs.length > 0) {
                const cleansedDebuffs = target.debuffs.map(d => d.name).join(', ');
                target.debuffs = [];
                battleLog(`✦정화✦ ${target.name}: 모든 디버프(${cleansedDebuffs})가 정화되었습니다.`);
            }

            // 3. 시전자 [환원] 상태 진입
            caster.addBuff('restoration', '[환원]', 3, {
                description: "스킬 시전 시 체력이 가장 낮은 아군 추가 회복 (3턴).",
                healPower: caster.getEffectiveStat('def') * 0.6
            });
            battleLog(`✦버프✦ ${caster.name}: [환원] 상태가 되어, 3턴간 스킬 사용 시 아군을 추가 회복합니다.`);
            
            return true;
        }
    },
    
    // [보상]
    SKILL_COMPENSATION: {
        id: "SKILL_COMPENSATION",
        name: "보상",
        type: "지정 디버프",
        description: "대가는 본래 나만을 위함을 의미하는 것이 아니다.<br><br>1) 시전자 (전체 체력x15%) 타격(고정 피해)<br>2) 해당 대상에게 [전이] 부여. <br>[전이] 상태 시, 피격당하면 타격한 플레이어가 (대상 공격력x100%) 회복.",
        targetType: "single_enemy",
        targetSelection: "enemy",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target || !target.isAlive) {
                battleLog(`✦정보✦ ${caster.name} [보상]: 대상을 찾을 수 없거나 대상이 쓰러져 있습니다.`);
                return false;
            }
            
            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [보상] 사용!`);
            
            // 1. 시전자 고정 피해
            const selfDamage = caster.maxHp * 0.15;
            caster.takeDamage(selfDamage, battleLog, null); // 자신에게 고정 피해, 공격자 없음
            battleLog(`✦소모✦ ${caster.name}: 스킬 대가로 ${selfDamage.toFixed(0)}의 피해를 입습니다.`);
            
            if (!caster.isAlive) return true; // 대가로 쓰러지면 스킬 종료

            // 2. 대상에게 [전이] 부여
            target.addDebuff('transfer', '[전이]', 2, {
                description: "피격 시 공격자를 (자신의 공격력x100%)만큼 회복시킴.",
                casterId: caster.id // 혹시 몰라 시전자 정보 저장
            });
            battleLog(`✦디버프✦ ${target.name}: [전이] 상태가 되었습니다 (2턴).`);

            return true;
        }
    },

    // [침전]
    SKILL_SEDIMENTATION: {
        id: "SKILL_SEDIMENTATION",
        name: "침전",
        type: "광역 버프",
        description: "희생은 언제나 숭고하다. 그러나 희생자는 누가 구할 것인가.<br><br>1) 시전자 (전체 체력x20%) 차감<br>2) 시전자 제외 전원 (잃은 체력x70%) 회복<br>3) [면역] 1회 부여. <br>[면역] 상태 시, 이후 상태 이상 1회 무조건 적용되지 않음.",
        targetType: "all_allies",
        targetSelection: "all_allies", // UI는 전체선택, 로직은 자신 제외
        execute: (caster, allies, enemies, battleLog) => {
            battleLog(`✦스킬✦ ${caster.name}, [침전] 사용!`);

            // 1. 시전자 체력 차감
            const hpCost = caster.maxHp * 0.2;
            caster.currentHp -= hpCost;
            battleLog(`✦소모✦ ${caster.name}: 자신을 희생하여 체력 ${hpCost.toFixed(0)}을 소모합니다.`);
            if (caster.currentHp <= 0) {
                caster.currentHp = 1; // 최소 체력 1로 생존
                battleLog(`✦효과✦ ${caster.name}, 쓰러지기 직전이지만 효과는 발동됩니다.`);
            }

            // 2 & 3. 시전자 제외 아군 회복 및 면역 부여
            allies.filter(a => a.isAlive && a.id !== caster.id).forEach(ally => {
                const lostHp = ally.maxHp - ally.currentHp;
                if (lostHp > 0) {
                    const healAmount = lostHp * 0.7;
                    ally.currentHp = Math.min(ally.maxHp, ally.currentHp + healAmount);
                    battleLog(`✦회복✦ ${ally.name}: 체력 ${healAmount.toFixed(0)} 회복. (HP: ${ally.currentHp.toFixed(0)})`);
                }
                ally.addBuff('immunity', '[면역]', 2, { // 2턴 지속. 사용 즉시 사라짐.
                    description: "다음 상태 이상 공격을 1회 무효화합니다.",
                    singleUse: true
                });
                battleLog(`✦버프✦ ${ally.name}: [면역] 효과를 얻었습니다 (1회).`);
            });

            return true;
        }
    },

    // [차연]
    SKILL_DIFFERANCE: {
        id: "SKILL_DIFFERANCE",
        name: "차연",
        type: "광역 버프",
        description: "자기희생의 완결은 영원히 지연된다. 우리의 마음에 남아.<br><br>1) 시전자 (전체 체력x15%) 타격(고정 피해)<br>2) 시전자 (전체 체력x30%) 회복<br>3) 전원 [흔적] 상태 진입. <br>[흔적] 상태 시, 피격당한 아군의 현재 체력이 50% 이하라면 시전자가 (전체 체력x5%)를 잃고 아군 (전체 체력x25%) 회복 3턴 지속, 연달아 사용하더라도 최대 3턴",
        targetType: "all_allies", // 실제 효과는 '전원'에게 적용
        targetSelection: "all_allies",
        execute: (caster, allies, enemies, battleLog) => {
            battleLog(`✦스킬✦ ${caster.name}, [차연] 사용!`);
            
            // 1. 시전자 고정 피해
            const selfDamage = caster.maxHp * 0.15;
            caster.takeDamage(selfDamage, battleLog, null);
            battleLog(`✦소모✦ ${caster.name}: 스킬 사용을 위해 ${selfDamage.toFixed(0)}의 피해를 입습니다.`);
            
            if (!caster.isAlive) return true;

            // 2. 시전자 체력 회복
            const selfHeal = caster.maxHp * 0.3;
            caster.currentHp = Math.min(caster.maxHp, caster.currentHp + selfHeal);
            battleLog(`✦회복✦ ${caster.name}: 체력 ${selfHeal.toFixed(0)} 회복. (HP: ${caster.currentHp.toFixed(0)})`);

            // 3. 전원에게 [흔적] 부여 (아군, 적군 포함)
            const allCharacters = [...allies, ...enemies];
            allCharacters.filter(c => c.isAlive).forEach(character => {
                character.addBuff('trace', '[흔적]', 3, {
                    description: "체력이 50% 이하일 때 피격 시, [차연] 시전자가 희생하여 자신을 회복시킴 (3턴).",
                    originalCasterId: caster.id
                });
                battleLog(`✦버프✦ ${character.name}: [흔적] 상태가 되었습니다 (3턴).`);
            });

            return true;
        }
    }

    //몬스터 스킬 추가
    // A-1 레이드 스킬 추가
    SKILL_Seismic_Fissure: {
        id: "SKILL_Seismic_Fissure",
        name: "균열의 진동", // ➃
        execute: (caster, allies, enemies, battleLog) => {
            battleLog(`\n<pre>마른 땅이 갈라지며 균열이 퍼져나간다.\n이 전장은 오로지 한 생명의 손아귀에 놓여 있다.\n"땅이 갈라지는 소리를 들은 적 있느냐."</pre>\n`);
            const hitArea = "1,1;2,1;3,1;1,2;3,2;1,3;2,3;3,3".split(';').map(s => {
                const [x, y] = s.split(',');
                return { x: parseInt(x), y: parseInt(y) };
            });
            const damage = caster.getEffectiveStat('atk');
            
            enemies.forEach(target => { // 여기서 enemies는 '아군' 캐릭터 목록입니다.
                if (hitArea.some(pos => pos.x === target.posX && pos.y === target.posY)) {
                    battleLog(`✦광역 피해✦ ${caster.name}의 [균열의 진동]이 ${target.name}에게 적중!`);
                    target.takeDamage(damage, battleLog, caster);
                }
            });
            return true;
        }
    },
    SKILL_Echo_of_Silence: {
        id: "SKILL_Echo_of_Silence",
        name: "침묵의 메아리", // ➄
        execute: (caster, allies, enemies, battleLog) => {
            battleLog(`\n<pre>기묘한 울림이 공간을 가른다.\n거대한 풍광의 압을 앞에 두고, 달리 무엇을 말할 수 있겠는가?\n"자연의 숨결 앞에서는 그 어떤 주문도 무의미하다."</pre>\n`);
            const hitArea = "0,2;1,1;3,1;2,0;4,2;1,3;3,3".split(';').map(s => { // 중복된 4,2를 제거하고 1개만 사용
                const [x, y] = s.split(',');
                return { x: parseInt(x), y: parseInt(y) };
            });
            const targets = enemies.filter(target => hitArea.some(pos => pos.x === target.posX && pos.y === target.posY));
            const silenceDuration = targets.length;

            if (silenceDuration > 0) {
                targets.forEach(target => {
                    battleLog(`✦광역 디버프✦ ${caster.name}의 [침묵의 메아리]가 ${target.name}에게 적중!`);
                    target.addDebuff('silence', '[침묵]', silenceDuration, {
                        description: `버프, 디버프, 치료, 카운터 유형 주문 사용 불가 (${silenceDuration}턴)`
                    });
                });
            } else {
                battleLog(`✦효과 없음✦ [침묵의 메아리]의 영향을 받은 대상이 없습니다.`);
            }
            return true;
        }
    },
    SKILL_Crushing_Sky: {
        id: "SKILL_Crushing_Sky",
        name: "무너지는 하늘", // ➅
        execute: (caster, allies, enemies, battleLog) => {
            battleLog(`\n<pre>거대한 석괴가 하늘에서 떨어지기 시작한다.\n때로 자연이라는 것은, 인간에게 이다지도 무자비하다.\n"대지가 너희에게 분노하리라."</pre>\n`);
            const hitArea = "2,0;2,1;0,2;1,2;3,2;4,2;2,3;2,4".split(';').map(s => {
                const [x, y] = s.split(',');
                return { x: parseInt(x), y: parseInt(y) };
            });
            const damage = caster.getEffectiveStat('atk');

            enemies.forEach(target => {
                if (hitArea.some(pos => pos.x === target.posX && pos.y === target.posY)) {
                    battleLog(`✦광역 피해✦ ${caster.name}의 [무너지는 하늘]이 ${target.name}에게 적중!`);
                    target.takeDamage(damage, battleLog, caster);
                }
            });
            return true;
        }
    },

};

// --- 0.5. HTML 요소 가져오기 헬퍼 함수 ---
function getElement(id) {
    return document.getElementById(id);
}

// --- 1. 전역 변수 및 UI 요소 ---
let allyCharacters = [];
let enemyCharacters = [];
let currentTurn = 0;
let isBattleStarted = false;
// let currentActingCharacterIndex = 0; // 행동 순서 직접 지정으로 변경되어 사용 방식 변경
let playerActionsQueue = [];
let characterPositions = {}; 
let actedAlliesThisTurn = []; // 이번 턴에 행동을 마친 아군 ID 목록 (행동 순서 직접 지정용)

let selectedAction = {
    type: null, 
    casterId: null,
    skillId: null,
    targetId: null,
    subTargetId: null,
    moveDelta: null 
};

const skillSelectionArea = getElement('skillSelectionArea');
const currentActingCharName = getElement('currentActingCharName');
const availableSkillsDiv = getElement('availableSkills');
const movementControlsArea = getElement('movementControlsArea'); 
const selectedTargetName = getElement('selectedTargetName');
const confirmActionButton = getElement('confirmActionButton');
const executeTurnButton = getElement('executeTurnButton');
const startButton = getElement('startButton');
const nextTurnButton = getElement('nextTurnButton'); // 역할 변경 또는 제거됨 (promptAllySelection에서 관리)
const battleLogDiv = getElement('battleLog');
const mapGridContainer = getElement('mapGridContainer'); 
const skillDescriptionArea = getElement('skillDescriptionArea');
const allySelectionButtonsDiv = getElement('allySelectionButtons'); // HTML에 추가 필요 <div id="allySelectionButtons"></div>


// --- 2. 핵심 클래스 정의 ---
class Character {
    constructor(name, type, currentHpOverride = null) {
        this.id = Math.random().toString(36).substring(2, 11);
        this.name = name;
        this.type = type;

        this.atk = 15;
        this.matk = 15;
        this.def = 15;
        this.mdef = 15;

        switch (type) {
            case "천체": this.matk = 20; break;
            case "암석": this.def = 20; break;
            case "야수": this.atk = 20; break;
            case "나무": this.mdef = 20; break;
        }

        this.maxHp = 100;
        this.currentHp = (currentHpOverride !== null && !isNaN(currentHpOverride) && currentHpOverride > 0)
                       ? Math.min(currentHpOverride, this.maxHp)
                       : this.maxHp;
        if (this.currentHp > this.maxHp) this.currentHp = this.maxHp;

        this.isAlive = true;
        this.skills = Object.values(SKILLS).map(skill => skill.id);
        this.buffs = [];
        this.debuffs = [];
        this.shield = 0;
        this.aggroDamageStored = 0; 
        this.lastSkillTurn = {}; 
        this.lastAttackedBy = null; 
        this.currentTurnDamageTaken = 0; 
        this.totalDamageTakenThisBattle = 0; 

        this.gimmicks = []; // 몬스터가 가진 기믹 목록
        this.activeGimmick = null; // 현재 활성화된 기믹 ID

        this.posX = -1; 
        this.posY = -1; 
    }

    addBuff(id, name, turns, effect, unremovable = false, isStacking = false) { // isStacking 파라미터 추가 (실존 스킬용)
        let existingBuff = this.buffs.find(b => b.id === id);
    
        // 이전 보호막 버프 제거 로직 (중첩 방지 및 정확한 값 관리를 위해)
        if (existingBuff && existingBuff.effect.shieldAmount && !isStacking) { // 스택형 보호막이 아니라면 기존 보호막 효과 제거
            this.shield = Math.max(0, this.shield - existingBuff.effect.shieldAmount);
            // console.log(`[DEBUG AddBuff] ${this.name}: 이전 ${existingBuff.name} 보호막(${existingBuff.effect.shieldAmount}) 제거. 현재 보호막: ${this.shield}`);
        }
    
        if (existingBuff) {
            existingBuff.turnsLeft = Math.max(existingBuff.turnsLeft, turns); // 지속시간은 긴 쪽으로
            
            if (isStacking && effect.stacks && existingBuff.stacks !== undefined) { // 스택 누적
                existingBuff.stacks += effect.stacks;
            } else if (effect.stacks) { // 일반적인 스택 또는 스택형 버프의 첫 적용
                 existingBuff.stacks = effect.stacks;
            }
            // effect 객체 병합 시 주의: shieldAmount 같은 값은 덮어써야 할 수 있음
            existingBuff.effect = {...existingBuff.effect, ...effect}; 
            if (effect.lastAppliedTurn) existingBuff.lastAppliedTurn = effect.lastAppliedTurn; // 연속 사용 체크용

        } else {
            existingBuff = { id, name, turnsLeft: turns, effect, unremovable, stacks: effect.stacks || 1 };
            if (effect.lastAppliedTurn) existingBuff.lastAppliedTurn = effect.lastAppliedTurn;
            this.buffs.push(existingBuff);
        }
    
        // 새로운 버프가 보호막을 제공하면 shield에 추가 (isStacking이 아니거나, 스택형 보호막의 첫 적용 시)
        // 또는 스택형 보호막이라도 매번 shieldAmount를 더해야 한다면 이 조건문 수정 필요
        if (effect.shieldAmount && typeof effect.shieldAmount === 'number') {
            if (isStacking && existingBuff.stacks > effect.stacks) { // 이미 스택이 있었고 추가된 경우 (실존 스킬이 스택당 보호막 증가가 아니라면 이 로직 불필요)
                // 실존 스킬은 스택만 쌓고 보호막은 직접 부여하지 않으므로, 이 부분은 addBuff 일반론
            } else { // 일반 버프 또는 스택형 버프의 첫 적용/갱신
                 this.shield += effect.shieldAmount;
            }
            // console.log(`[DEBUG AddBuff] ${this.name}: ${name} 버프(${effect.shieldAmount}) 적용/갱신. 현재 보호막: ${this.shield}`);
        }
    }

    addDebuff(id, name, turns, effect) {
        // [면역] 효과 체크
        const immunityBuff = this.buffs.find(b => b.id === 'immunity' && b.effect.singleUse);
        if (immunityBuff) {
            logToBattleLog(`✦효과✦ ${this.name}: [면역] 효과로 [${name}] 디버프를 무효화합니다.`);
            this.removeBuffById('immunity'); // 1회용이므로 사용 후 제거
            return; // 디버프를 추가하지 않고 함수 종료
        }

        let existingDebuff = this.debuffs.find(d => d.id === id);
        if (existingDebuff) {
            if (effect.overrideDuration) { // 흠집처럼 중첩 시 지속 시간 갱신
                existingDebuff.turnsLeft = turns;
            } else {
                existingDebuff.turnsLeft = Math.max(existingDebuff.turnsLeft, turns);
            }

            if (effect.maxStacks && existingDebuff.stacks !== undefined) { // 스택 증가 (최대치까지)
                existingDebuff.stacks = Math.min(effect.maxStacks, (existingDebuff.stacks || 0) + 1);
            } else if (effect.maxStacks) { // 첫 스택
                existingDebuff.stacks = 1;
            }
            // effect 객체 병합
             existingDebuff.effect = {...existingDebuff.effect, ...effect};
        } else {
            this.debuffs.push({ id, name, turnsLeft: turns, effect, stacks: effect.maxStacks ? 1 : undefined });
        }
    }

    getDebuffStacks(id) {
        const debuff = this.debuffs.find(d => d.id === id);
        return debuff && debuff.stacks !== undefined ? debuff.stacks : (debuff ? 1 : 0) ; // 스택 없으면 1개로 간주 (활성화 여부) or 0
    }

    hasBuff(id) {
        return this.buffs.some(b => b.id === id && b.turnsLeft > 0);
    }
    hasDebuff(id) {
        return this.debuffs.some(d => d.id === id && d.turnsLeft > 0);
    }

    removeBuffById(id) {
        const buffIndex = this.buffs.findIndex(b => b.id === id && !b.unremovable);
        if (buffIndex > -1) {
            const removedBuff = this.buffs[buffIndex];
    
            if (removedBuff.effect.shieldAmount) {
                this.shield = Math.max(0, this.shield - removedBuff.effect.shieldAmount);
                logToBattleLog(`✦효과 해제✦ ${this.name}: [${removedBuff.name}] 효과 종료, 보호막 -${removedBuff.effect.shieldAmount.toFixed(0)}. (현재 총 보호막: ${this.shield.toFixed(0)})`);
            }
    
            if (removedBuff.id === 'will_buff' && removedBuff.effect.healOnRemove) {
                if (this.shield > 0) { // [의지] 해제 시 현재 '모든' 보호막을 체력으로 흡수
                    const healAmount = this.shield; 
                    this.currentHp = Math.min(this.maxHp, this.currentHp + healAmount);
                    logToBattleLog(`✦효과✦ ${this.name} ([${removedBuff.name}] 해제): 보호막 ${healAmount.toFixed(0)}만큼 체력 흡수. (HP: ${this.currentHp.toFixed(0)})`);
                    this.shield = 0; // 모든 보호막 소모
                }
                if (removedBuff.effect.resetsTotalDamageTaken) {
                    this.totalDamageTakenThisBattle = 0;
                    logToBattleLog(`✦정보✦ ${this.name}: [${removedBuff.name}] 효과로 누적 받은 피해 총합이 초기화되었습니다.`);
                }
            }
            this.buffs.splice(buffIndex, 1);
        }
    }

    takeDamage(rawDamage, logFn, attacker = null, currentOpponentList = null) {
        if (!this.isAlive) return;

        // [철옹성] 피해 이전 로직
        if (this.isAlive && attacker && allyCharacters.includes(this)) { // 자신이 아군일 때만 다른 아군에게 이전 시도
            const ironFortressAlly = allyCharacters.find(ally =>
                ally.isAlive &&
                ally.id !== this.id && 
                ally.hasBuff('iron_fortress')
            );

            if (ironFortressAlly) {
                logFn(`✦피해 이전✦ ${this.name}의 받을 피해 ${rawDamage.toFixed(0)}가 [철옹성] 효과를 지닌 ${ironFortressAlly.name}에게 이전됩니다.`);
                ironFortressAlly.takeDamage(rawDamage, logFn, attacker); 
                return; 
            }
        }

        let finalDamage = rawDamage;
        const initialHp = this.currentHp;
        const prevIsAlive = this.isAlive;

        // 받는 피해 감소 효과 (도발 등)
        const provokeReductionBuff = this.buffs.find(b => b.id === 'provoke_damage_reduction' && b.turnsLeft > 0);
        if (provokeReductionBuff && provokeReductionBuff.effect.damageReduction) {
            finalDamage *= (1 - provokeReductionBuff.effect.damageReduction);
            // logFn(`✦효과✦ ${this.name} [도발]: 받는 피해 ${rawDamage.toFixed(0)} → ${finalDamage.toFixed(0)}(으)로 감소.`);
        }
    
        // 보호막으로 피해 흡수
        if (this.shield > 0) {
            const damageToShield = Math.min(finalDamage, this.shield);
            if (damageToShield > 0) {
                this.shield -= damageToShield;
                finalDamage -= damageToShield;
                logFn(`✦보호막✦ ${this.name}: 보호막으로 피해 ${damageToShield.toFixed(0)} 흡수. (남은 보호막: ${this.shield.toFixed(0)})`);
            }
        }
    
        const hpLossBeforeDeath = this.currentHp;
        this.currentHp -= finalDamage;
        const actualHpLoss = hpLossBeforeDeath - Math.max(0, this.currentHp); 
    
        if (actualHpLoss > 0) {
            this.currentTurnDamageTaken += actualHpLoss;
            this.totalDamageTakenThisBattle += actualHpLoss;
            if (this.hasBuff('provoke_active')) { // 도발 중 피해 저장 (SKILL_REVERSAL용)
                 this.aggroDamageStored += actualHpLoss;
            }
        }
        this.lastAttackedBy = attacker ? attacker.id : null;
    
        // 반격 로직 ([응수], [격노], [역습])
        if (attacker && attacker.isAlive && actualHpLoss > 0) {
            const alliesOfAttacked = allyCharacters.includes(this) ? allyCharacters : enemyCharacters;
            const enemiesOfAttacked = allyCharacters.includes(this) ? enemyCharacters : allyCharacters; // 공격자의 적 = 피격자 편

            // 1. 피격자 본인 또는 아군이 [응수]/[격노] 버프를 가졌을 때
            // 피격자 본인
            if (this.hasBuff('riposte_stance')) { 
                let highestHpEnemies = [];
                let maxHp = -1;
                enemies.filter(e => e.isAlive).forEach(enemy => { // 여기서 enemies는 항상 모든 적군 리스트
                    if (enemy.currentHp > maxHp) { maxHp = enemy.currentHp; highestHpEnemies = [enemy]; }
                    else if (enemy.currentHp === maxHp) { highestHpEnemies.push(enemy); }
                });
                if (highestHpEnemies.length > 0) {
                    const targetEnemy = highestHpEnemies.length === 1 ? highestHpEnemies[0] : highestHpEnemies[Math.floor(Math.random() * highestHpEnemies.length)];
                    const counterDmg = actualHpLoss * 1.5;
                    logFn(`✦반격✦ ${this.name} ([응수]), ${targetEnemy.name}에게 ${counterDmg.toFixed(0)} 피해.`);
                    targetEnemy.takeDamage(counterDmg, logFn, this);
                }
            } else if (this.hasBuff('fury_stance')) { 
                const counterDmg = actualHpLoss * 1.5;
                enemies.filter(e => e.isAlive).forEach(enemy => {
                    logFn(`✦광역 반격✦ ${this.name} ([격노]), ${enemy.name}에게 ${counterDmg.toFixed(0)} 피해.`);
                    enemy.takeDamage(counterDmg, logFn, this);
                });
            }

            // 피격자의 아군 (피격자 자신 제외)
            alliesOfAttacked.forEach(allyCaster => {
                if (allyCaster.isAlive && allyCaster.id !== this.id) {
                    if (allyCaster.hasBuff('riposte_stance')) { 
                        let lowestHpEnemies = [];
                        let minHp = Infinity;
                        enemies.filter(e => e.isAlive).forEach(enemy => {
                            if (enemy.currentHp < minHp) { minHp = enemy.currentHp; lowestHpEnemies = [enemy];}
                            else if (enemy.currentHp === minHp) { lowestHpEnemies.push(enemy); }
                        });
                        if (lowestHpEnemies.length > 0) {
                            const targetEnemy = lowestHpEnemies.length === 1 ? lowestHpEnemies[0] : lowestHpEnemies[Math.floor(Math.random() * lowestHpEnemies.length)];
                            const counterDmg = actualHpLoss * 0.5; 
                            logFn(`✦지원 반격✦ ${allyCaster.name} ([응수] 발동, ${this.name} 피격), ${targetEnemy.name}에게 ${counterDmg.toFixed(0)} 피해.`);
                            targetEnemy.takeDamage(counterDmg, logFn, allyCaster);
                        }
                    } else if (allyCaster.hasBuff('fury_stance')) { 
                        const counterDmg = actualHpLoss * 0.5; 
                        enemies.filter(e => e.isAlive).forEach(enemy => {
                            logFn(`✦지원 광역 반격✦ ${allyCaster.name} ([격노] 발동, ${this.name} 피격), ${enemy.name}에게 ${counterDmg.toFixed(0)} 피해.`);
                            enemy.takeDamage(counterDmg, logFn, allyCaster);
                        });
                    }
                }
            });

            // [역습] 로직 (피격자 본인만 해당)
            if (this.hasBuff('reversal_active')) {
                const storedDamage = this.aggroDamageStored || 0; // 도발로 저장된 피해
                let reversalDamage = 0;
                let reversalDamageType = '';
                let reversalDamageTypeKr = '';

                if (currentTurn % 2 !== 0) { // 홀수 턴
                    reversalDamage = (this.getEffectiveStat('atk') + storedDamage) * 1.5;
                    reversalDamageType = 'physical';
                    reversalDamageTypeKr = '물리';
                } else { // 짝수 턴
                    reversalDamage = (this.getEffectiveStat('matk') + storedDamage) * 1.5;
                    reversalDamageType = 'magical';
                    reversalDamageTypeKr = '마법';
                }
                if (reversalDamage > 0) {
                    logFn(`✦역습✦ ${this.name} ([역습] 발동, [도발] 저장 피해: ${storedDamage.toFixed(0)}): ${attacker.name}에게 ${reversalDamage.toFixed(0)} ${reversalDamageTypeKr} 피해.`);
                    attacker.takeDamage(reversalDamage, logFn, this); // 공격한 적에게 피해
                }
                this.aggroDamageStored = 0; // 역습 후 도발 저장량 초기화
                this.removeBuffById('reversal_active'); // 역습 버프 제거
            }
        }
    
        // 피해 반사 (일반적인 반사 버프)
        const reflectBuff = this.buffs.find(b => b.effect.type === 'damage_reflect' && b.turnsLeft > 0);
        if (reflectBuff && attacker && attacker.isAlive && actualHpLoss > 0) {
            const reflectedDamage = actualHpLoss * reflectBuff.effect.value;
            if (reflectedDamage > 0) {
                logFn(`✦피해 반사✦ ${this.name} [${reflectBuff.name} 효과]: ${attacker.name}에게 ${reflectedDamage.toFixed(0)} 피해 반사.`);
                attacker.takeDamage(reflectedDamage, logFn, this);
            }
        }

                // [전이] 효과 (피격자가 디버프를 가짐)
        const transferDebuff = this.debuffs.find(d => d.id === 'transfer' && d.turnsLeft > 0);
        if (transferDebuff && attacker && attacker.isAlive) {
            const healToAttacker = this.getEffectiveStat('atk'); // 대상(피격자) 공격력 100%
            attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healToAttacker);
            logFn(`✦효과✦ ${this.name}의 [전이] 디버프로 인해, 공격자 ${attacker.name}의 체력이 ${healToAttacker.toFixed(0)} 회복합니다.`);
        }

        // [흔적] 효과 (피격자가 버프를 가짐)
        const traceBuff = this.buffs.find(b => b.id === 'trace' && b.turnsLeft > 0);
        if (traceBuff && this.isAlive && this.currentHp <= this.maxHp * 0.5) {
            const originalCaster = findCharacterById(traceBuff.effect.originalCasterId);
            if (originalCaster && originalCaster.isAlive) {
                const hpCostForCaster = originalCaster.maxHp * 0.05;
                const healForTarget = this.maxHp * 0.25;

                originalCaster.currentHp -= hpCostForCaster;
                logFn(`✦효과✦ ${this.name}의 [흔적] 버프로 인해, ${originalCaster.name}의 체력이 ${hpCostForCaster.toFixed(0)} 감소합니다.`);
                if (originalCaster.currentHp <= 0) {
                     originalCaster.currentHp = 0;
                     originalCaster.isAlive = false;
                     logFn(`✦전투 불능✦ ${originalCaster.name}, [흔적]의 대가로 쓰러집니다.`);
                }

                this.currentHp = Math.min(this.maxHp, this.currentHp + healForTarget);
                logFn(`✦효과✦ 그리고 ${this.name}의 체력을 ${healForTarget.toFixed(0)} 회복합니다.`);
            }
        }
        
        if (this.currentHp <= 0) {
            this.currentHp = 0;
            if (prevIsAlive) {
                logFn(`✦전투 불능✦ ${this.name}, 쓰러집니다.`);
            }
            this.isAlive = false;
            // 전투 불능 시 모든 버프/디버프 제거 (선택적)
            // this.buffs = []; this.debuffs = []; this.shield = 0;
        }
        logFn(`✦정보✦ ${this.name} HP: ${initialHp.toFixed(0)} → ${this.currentHp.toFixed(0)} (보호막: ${this.shield.toFixed(0)})`);
    }

    getEffectiveStat(statName) {
        let value = this[statName]; // 기본 스탯 (atk, matk, def, mdef)
        this.buffs.forEach(buff => {
            if (buff.turnsLeft > 0 && buff.effect) {
                if (buff.effect.type === `${statName}_boost_multiplier`) value *= buff.effect.value;
                if (buff.effect.type === `${statName}_boost_flat`) value += buff.effect.value;
                
                // [실재] 스택 효과 (공격력/마법공격력)
                if (buff.id === 'reality_stacks' && buff.effect.stacks > 0) {
                    if (statName === 'atk' && buff.effect.atkBoostPerStack) {
                        value += (this.atk * buff.effect.atkBoostPerStack * buff.effect.stacks); // 기본 공격력 비례
                    }
                    if (statName === 'matk' && buff.effect.matkBoostPerStack) {
                        value += (this.matk * buff.effect.matkBoostPerStack * buff.effect.stacks); // 기본 마법공격력 비례
                    }
                }
                // [허상] 공격력 증가 효과
                if (buff.id === 'illusion_atk_boost' && statName === 'atk' && buff.effect.multiplier) {
                    // value *= buff.effect.multiplier; // 중첩 적용될 수 있으므로, getEffectiveStat 설계 시 주의
                    // illusion_atk_boost 버프 효과 정의 시 type을 'atk_boost_multiplier'로 통일했으면 위에서 처리됨
                }
            }
        });
        this.debuffs.forEach(debuff => {
            if (debuff.turnsLeft > 0 && debuff.effect) {
                // 디버프로 인한 스탯 감소 로직 (필요시 추가)
                // 예: if (debuff.effect.type === `${statName}_reduction_multiplier`) value *= (1 - debuff.effect.value);
            }
        });
        return Math.max(0, value); // 스탯은 0 이상
    }
}


// --- 3. 유틸리티 및 UI 관리 함수 ---
function logToBattleLog(message) {
    if (battleLogDiv) {
        // 메시지 앞뒤 공백 제거 테스트
        const trimmedmessage = typeof message === 'string' ? message.trim() : message;
        battleLogDiv.innerHTML += trimmedmessage + '<br>'; //띄쓰
        battleLogDiv.scrollTop = battleLogDiv.scrollHeight;
    } else {
        console.error("battleLogDiv is not defined.");
    }

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
    console.log(`addCharacter 함수 호출됨 - 팀: ${team}, 이름: ${getElement('charName').value}`); // 디버깅 로그 추가
    const nameInput = getElement('charName');
    const typeInput = getElement('charType');
    const hpInput = getElement('charCurrentHp');

    const name = nameInput.value.trim() || (team === 'ally' ? `아군${allyCharacters.length+1}` : `적군${enemyCharacters.length+1}`);
    const type = typeInput.value;
    let currentHp = hpInput.value.trim() === '' ? null : parseInt(hpInput.value);

    if (!name) { alert('캐릭터 이름을 입력해 주세요.'); nameInput.focus(); return; }
    if (currentHp !== null && (isNaN(currentHp) || currentHp <= 0)) {
        alert('유효한 현재 체력을 입력하거나 비워 두세요.'); hpInput.focus(); return;
    }

    const newChar = new Character(name, type, currentHp);
    const cell = getRandomEmptyCell();
    if (cell) {
        newChar.posX = cell.x;
        newChar.posY = cell.y;
        characterPositions[`${cell.x},${cell.y}`] = newChar.id;
    } else {
        logToBattleLog(`✦경고✦: ${name}을(를) 배치할 빈 공간이 맵에 없습니다.`);
    }

        if (team === 'ally') {
        allyCharacters.push(newChar);
        console.log('[DEBUG] 아군 합류 logToBattleLog 호출 직전'); // 첫 번째 로그 호출 지점
        logToBattleLog(`✦합류✦ 아군 [${name}, ${type})] (HP: ${newChar.currentHp}/${newChar.maxHp}), [${newChar.posX},${newChar.posY}].`);
        } else if (team === 'enemy') {
            enemyCharacters.push(newChar);
            console.log('[DEBUG] 적군 합류 logToBattleLog 호출 직전'); // 두 번째 로그 호출 지점
            logToBattleLog(`✦합류✦ 적군 [${name}, ${type})] (HP: ${newChar.currentHp}/${newChar.maxHp}), [${newChar.posX},${newChar.posY}].`);
        }
        nameInput.value = '';
        hpInput.value = '';
    
        console.log('[DEBUG] displayCharacters 호출 직전'); // displayCharacters 호출 지점
        displayCharacters();
        console.log(`[DEBUG] addCharacter 종료 - team: ${team}`); // 함수 종료점
    }

function deleteCharacter(characterId, team) {
    let targetArray = team === 'ally' ? allyCharacters : enemyCharacters;
    const charIndex = targetArray.findIndex(char => char.id === characterId);

    if (charIndex > -1) {
        const charToRemove = targetArray[charIndex];
        if (charToRemove.posX !== -1 && charToRemove.posY !== -1) {
             delete characterPositions[`${charToRemove.posX},${charToRemove.posY}`];
        }
        targetArray.splice(charIndex, 1);
        logToBattleLog(`🗑️ ${team === 'ally' ? '아군' : '적군'} [${charToRemove.name}] 제외됨.`);
    }
    displayCharacters();
}

function createCharacterCard(character, team) {
    const card = document.createElement('div');
    card.className = 'character-stats';
    // 대상 선택 시 하이라이트
    if (selectedAction.targetId === character.id || 
        (selectedAction.type === 'skill' && SKILLS[selectedAction.skillId]?.targetSelection === 'two_enemies' && selectedAction.subTargetId === character.id)) {
        card.classList.add('selected');
    }

    card.innerHTML = `
        <p><strong>${character.name} (${character.type})</strong> ${character.posX !== -1 ? `[${character.posX},${character.posY}]` : ''}</p>
        <p>HP: ${character.currentHp.toFixed(0)} / ${character.maxHp.toFixed(0)} ${character.shield > 0 ? `(+${character.shield.toFixed(0)}🛡️)` : ''}</p>
        <p>공격력: ${character.getEffectiveStat('atk').toFixed(0)} | 마법 공격력: ${character.getEffectiveStat('matk').toFixed(0)}</p>
        <p>방어력: ${character.getEffectiveStat('def').toFixed(0)} | 마법 방어력: ${character.getEffectiveStat('mdef').toFixed(0)}</p>
        <p>상태: ${character.isAlive ? '생존' : '<span style="color:red;">쓰러짐</span>'}</p>
        ${character.buffs.length > 0 ? `<p>버프: ${character.buffs.map(b => `${b.name}(${b.turnsLeft}턴${b.stacks > 1 ? `x${b.stacks}` : ''})`).join(', ')}</p>` : ''}
        ${character.debuffs.length > 0 ? `<p>디버프: ${character.debuffs.map(d => `${d.name}(${d.turnsLeft}턴${d.stacks > 1 ? `x${d.stacks}`:''})`).join(', ')}</p>` : ''}
        ${isBattleStarted ? '' : `<button class="delete-char-button" onclick="deleteCharacter('${character.id}', '${team}')">X</button>`}
    `; // 전투 중에는 삭제 버튼 비활성화
    
    // 카드 클릭 시 대상 선택 로직
    card.onclick = (event) => {
        if (event.target.classList.contains('delete-char-button')) return; // 삭제 버튼 클릭은 무시
        if (isBattleStarted && skillSelectionArea.style.display !== 'none' && selectedAction.type === 'skill') {
            selectTarget(character.id);
        }
    };
    return card;
}

/**
 * HTML의 '맵 불러오기' 버튼 클릭 시 호출되는 함수입니다.
 * 선택된 맵 ID를 loadMap 함수에 전달합니다.
 */
function loadSelectedMap() {
    if (isBattleStarted) {
        alert("전투 중에는 맵을 변경할 수 없습니다.");
        return;
    }
    const mapSelect = getElement('mapSelect');
    const selectedMapId = mapSelect.value;
    loadMap(selectedMapId);
}

/**
 * mapId를 받아 mapdata.js의 설정에 따라 맵의 적군을 불러오고 배치합니다.
 * @param {string} mapId - 불러올 맵의 ID (예: "A-1")
 */
function loadMap(mapId) {
    const mapConfig = MAP_CONFIGS[mapId];
    if (!mapConfig) {
        logToBattleLog(`✦경고✦: 맵 [${mapId}]의 설정 정보를 찾을 수 없습니다.`);
        return;
    }

    // --- 변경점 1: 맵 등장 대사(Flavor Text) 출력 ---
    if (mapConfig.flavorText) {
        // pre 태그를 사용하여 줄바꿈을 그대로 표시합니다.
        logToBattleLog(`\n<pre>${mapConfig.flavorText}</pre>\n`);
    } else {
        logToBattleLog(`--- 맵 [${mapConfig.name}]을(를) 불러옵니다. ---`);
    }

    // 기존 적군 정보 초기화
    enemyCharacters = [];
    
    // 맵 데이터에 따라 새로운 적군 생성
    mapConfig.enemies.forEach(mapEnemy => {
        const template = MONSTER_TEMPLATES[mapEnemy.templateId];
        if (!template) {
            logToBattleLog(`✦경고✦: 몬스터 템플릿 [${mapEnemy.templateId}]를 찾을 수 없습니다.`);
            return; // 다음 몬스터로 넘어감
        }

        // 랜덤 타입 결정 로직 (기존과 동일)
        let monsterType;
        if (Array.isArray(template.type)) {
            monsterType = template.type[Math.floor(Math.random() * template.type.length)];
        } else {
            monsterType = template.type;
        }

        // 템플릿 기반으로 새로운 캐릭터(몬스터) 생성
        const newEnemy = new Character(template.name, monsterType);
        
        // --- 변경점 2: 상세 능력치, 스킬, 기믹 정보 적용 ---
        newEnemy.maxHp = template.maxHp || 100;
        newEnemy.currentHp = newEnemy.maxHp;
        newEnemy.atk = template.atk || 15;
        newEnemy.matk = template.matk || 15;
        newEnemy.def = template.def || 15;
        newEnemy.mdef = template.mdef || 15;
        newEnemy.skills = template.skills ? [...template.skills] : [];
        newEnemy.gimmicks = template.gimmicks ? [...template.gimmicks] : [];
        
        enemyCharacters.push(newEnemy);
        logToBattleLog(`✦합류✦ 적군 [${newEnemy.name}, ${newEnemy.type}] (HP: ${newEnemy.currentHp}/${newEnemy.maxHp}), [${newEnemy.posX},${newEnemy.posY}].`);
    });

    // characterPositions 객체 재구성
    characterPositions = {};
    [...allyCharacters, ...enemyCharacters].forEach(char => {
        if (char.isAlive && char.posX !== -1 && char.posY !== -1) {
            characterPositions[`${char.posX},${char.posY}`] = char.id;
        }
    });

    // 화면 업데이트
    displayCharacters();
}

function displayCharacters() {
    const allyDisplay = getElement('allyCharacters');
    const enemyDisplay = getElement('enemyCharacters');

    allyDisplay.innerHTML = allyCharacters.length === 0 ? '<p>아군 캐릭터가 없습니다.</p>' : '';
    allyCharacters.forEach(char => allyDisplay.appendChild(createCharacterCard(char, 'ally')));

    enemyDisplay.innerHTML = enemyCharacters.length === 0 ? '<p>적군 캐릭터가 없습니다.</p>' : '';
    enemyCharacters.forEach(char => enemyDisplay.appendChild(createCharacterCard(char, 'enemy')));

    if (typeof renderMapGrid === 'function') {
        renderMapGrid(mapGridContainer, allyCharacters, enemyCharacters);
    } else if (mapGridContainer) {
        mapGridContainer.innerHTML = '<p>맵 로딩 실패: renderMapGrid 함수 없음.</p>';
    }
}


// --- 4. 핵심 전투 로직 함수 ---
function calculateDamage(attacker, defender, skillPower, damageType, statTypeToUse = null) {
    // --- 2-6: 대지의 수호 기믹 데미지 조절 로직 ---
    // 방어하는 캐릭터(defender)에게 '대지의 수호' 기믹이 활성화되어 있는지 확인합니다.
    if (defender.activeGimmick && defender.activeGimmick.startsWith("GIMMICK_Aegis_of_Earth")) {
        const gimmickData = GIMMICK_DATA[defender.activeGimmick];
        if (gimmickData) {
            // 기믹의 좌표 데이터를 가져와서 배열로 만듭니다.
            const safeZone = gimmickData.coords.split(';').map(s => {
                const [x, y] = s.split(',').map(Number); // 문자열을 숫자로 변환
                // 중요: 기믹 데이터 좌표는 1-based, 캐릭터 위치는 0-based 이므로 변환이 필요 없습니다.
                // 이전 스킬에서는 변환했지만, 여기서는 캐릭터 위치(posX, posY)와 직접 비교하므로
                // 기믹 데이터의 1-based 좌표를 그대로 사용합니다.
                return { x: x, y: y };
            });

            // 공격자(attacker)가 기믹의 영역(safeZone) 안에 있는지 확인합니다.
            const isAttackerInSafeZone = safeZone.some(pos => pos.x === attacker.posX && pos.y === attacker.posY);

            if (isAttackerInSafeZone) {
                // 영역 안에서 공격: 피해량 1.5배
                logToBattleLog(`✦기믹 효과✦ ${attacker.name}이(가) [${gimmickData.name}]의 영역 안에서 공격하여 피해량이 1.5배 증가합니다!`);
                skillPower *= 1.5;
            } else {
                // 영역 밖에서 공격: 피해량 0
                logToBattleLog(`✦기믹 효과✦ ${attacker.name}이(가) [${gimmickData.name}]의 영역 밖에서 공격하여 피해가 무시됩니다!`);
                return 0; // 데미지 계산을 중단하고 0을 반환
            }
        }
    }
    // --- 기믹 로직 끝 ---

    let baseAttackStat = 0;
    let defenseStat = 0;
    let actualSkillPower = skillPower;

    // 공격자 [쇠약] 디버프 확인 (기존 로직)
    const attackerWeakness = attacker.debuffs.find(d => d.id === 'weakness' && d.turnsLeft > 0);
    if (attackerWeakness && attackerWeakness.effect.damageMultiplierReduction) {
        actualSkillPower *= (1 - attackerWeakness.effect.damageMultiplierReduction);
    }

    if (damageType === 'physical') {
        baseAttackStat = attacker.getEffectiveStat(statTypeToUse || 'atk');
        defenseStat = defender.getEffectiveStat('def');
    } else if (damageType === 'magical') {
        baseAttackStat = attacker.getEffectiveStat(statTypeToUse || 'matk');
        defenseStat = defender.getEffectiveStat('mdef');
    } else if (damageType === 'fixed') {
        return Math.max(0, actualSkillPower); // 고정 피해는 방어력 무시
    } else { // 알 수 없는 타입
        return 0;
    }

    let damage = (baseAttackStat * actualSkillPower) - defenseStat;
    return Math.max(0, damage); // 최소 피해량은 0
}

function applyTurnStartEffects(character) {
    character.currentTurnDamageTaken = 0;

    const newBuffs = [];
    for (const buff of character.buffs) {
        let keepBuff = true;
        if (buff.effect.type === 'turn_start_heal' && buff.turnsLeft > 0) {
            const healAmount = buff.effect.value; // value가 고정값 또는 계산된 값이어야 함
            character.currentHp = Math.min(character.maxHp, character.currentHp + healAmount);
            logToBattleLog(`✦회복✦ ${character.name}, [${buff.name} 효과]: HP ${healAmount.toFixed(0)} 회복. (현재 HP: ${character.currentHp.toFixed(0)})`);
        }

        if (!buff.unremovable) {
            buff.turnsLeft--;
        }

        if (buff.turnsLeft <= 0 && !buff.unremovable) {
            if (buff.effect.shieldAmount) { // 보호막 버프 만료
                character.shield = Math.max(0, character.shield - buff.effect.shieldAmount);
                logToBattleLog(`✦효과 만료✦ ${character.name}: [${buff.name}] 효과 만료, 보호막 -${buff.effect.shieldAmount.toFixed(0)}. (현재 총 보호막: ${character.shield.toFixed(0)})`);
            }

            if (buff.id === 'will_buff' && buff.effect.healOnRemove) { // [의지] 버프 만료
                if (character.shield > 0) {
                    const healAmount = character.shield; // 현재 모든 보호막 흡수
                    character.currentHp = Math.min(character.maxHp, character.currentHp + healAmount);
                    logToBattleLog(`✦효과✦ ${character.name} ([${buff.name}] 만료): 보호막 ${healAmount.toFixed(0)}만큼 체력 흡수. (HP: ${character.currentHp.toFixed(0)})`);
                    character.shield = 0; // 모든 보호막 소모
                }
                if (buff.effect.resetsTotalDamageTaken) {
                    character.totalDamageTakenThisBattle = 0;
                    logToBattleLog(`✦정보✦ ${character.name}: [${buff.name}] 효과로 누적 받은 피해 총합이 초기화되었습니다.`);
                }
            }
            keepBuff = false; 
        }
        if (keepBuff) {
            newBuffs.push(buff);
        }
    }
    character.buffs = newBuffs;

    character.debuffs = character.debuffs.filter(debuff => {
        if (debuff.id === 'poison_truth' && debuff.turnsLeft > 0 && debuff.effect.type === 'fixed') { // 진리 중독
            const poisonDamage = debuff.effect.damagePerTurn;
            logToBattleLog(`✦상태 피해✦ ${character.name}, [${debuff.name} 효과]: ${poisonDamage.toFixed(0)} 고정 피해.`);
            character.takeDamage(poisonDamage, logToBattleLog, findCharacterById(debuff.effect.casterId) || null); 
        }
        // 다른 종류의 중독이나 도트데미지 디버프도 여기에 추가 가능
        debuff.turnsLeft--;
        return debuff.turnsLeft > 0;
    });
}

function processEndOfTurnEffects(actingChar) {
    // [허상] 턴 종료 추가 공격
    const illusionBuff = actingChar.buffs.find(b => b.id === 'illusion_end_turn_attack' && b.turnsLeft > 0);
    if (illusionBuff && illusionBuff.effect) {
        const casterOfIllusion = findCharacterById(illusionBuff.effect.attackerId);
        const enemyTargetForIllusion = findCharacterById(illusionBuff.effect.enemyTargetId);
        if (casterOfIllusion && enemyTargetForIllusion && enemyTargetForIllusion.isAlive) {
            const illusionDamage = calculateDamage(casterOfIllusion, enemyTargetForIllusion, illusionBuff.effect.power, illusionBuff.effect.damageType || 'physical');
            logToBattleLog(`✦추가 공격✦ ${casterOfIllusion.name} [허상 턴 종료]: ${enemyTargetForIllusion.name}에게 ${illusionDamage.toFixed(0)} 추가 ${illusionBuff.effect.damageType === 'magical' ? '마법' : '물리'} 피해.`);
            enemyTargetForIllusion.takeDamage(illusionDamage, logToBattleLog, casterOfIllusion);
        }
        actingChar.removeBuffById('illusion_end_turn_attack'); // 사용 후 제거
    }

    // [진리] 턴 종료 추가 공격
    const truthBuff = actingChar.buffs.find(b => b.id === 'truth_end_turn_attack_marker' && b.turnsLeft > 0);
    if (truthBuff && truthBuff.effect) {
        const casterOfTruth = findCharacterById(truthBuff.effect.originalCasterId);
        const aliveEnemiesForTruth = enemyCharacters.filter(e => e.isAlive);
        if (casterOfTruth && aliveEnemiesForTruth.length > 0) {
            const randomEnemyTarget = aliveEnemiesForTruth[Math.floor(Math.random() * aliveEnemiesForTruth.length)];
            const baseStatForTruth = truthBuff.effect.damageBaseStatAverage ? (casterOfTruth.getEffectiveStat('atk') + casterOfTruth.getEffectiveStat('matk')) / 2 : casterOfTruth.getEffectiveStat('atk');
            const truthDamage = calculateDamage(casterOfTruth, randomEnemyTarget, truthBuff.effect.power, 'physical', truthBuff.effect.damageBaseStatAverage ? null : 'atk'); // 임시로 물리피해, 스탯타입은 평균이면 null

            logToBattleLog(`✦추가 공격✦ ${casterOfTruth.name} [진리 턴 종료]: ${randomEnemyTarget.name}에게 ${truthDamage.toFixed(0)} 추가 피해.`);
            randomEnemyTarget.takeDamage(truthDamage, logToBattleLog, casterOfTruth);
        }
        actingChar.removeBuffById('truth_end_turn_attack_marker');
    }
}


// --- 5. 전투 흐름 및 행동 선택 함수 ---
function startBattle() {
    if (allyCharacters.length === 0 || enemyCharacters.length === 0) {
        alert('아군과 적군 모두 최소 한 명 이상의 캐릭터가 필요합니다.'); return;
    }
    if (isBattleStarted) { alert('이미 전투가 시작되었습니다.'); return; }

    isBattleStarted = true;
    currentTurn = 0; 
    playerActionsQueue = [];
    actedAlliesThisTurn = [];
    logToBattleLog('--- 전투 시작 ---');
    [...allyCharacters, ...enemyCharacters].forEach(char => {
        char.currentHp = char.maxHp; // 체력 완전 회복
        char.isAlive = true;
        char.buffs = []; 
        char.debuffs = []; 
        char.shield = 0;
        char.aggroDamageStored = 0; 
        char.lastSkillTurn = {};
        char.lastAttackedBy = null; 
        char.currentTurnDamageTaken = 0;
        char.totalDamageTakenThisBattle = 0; 
    });
    displayCharacters(); // 초기화된 캐릭터 상태 표시

    if(startButton) startButton.style.display = 'none';
    // nextTurnButton, executeTurnButton은 prepareNewTurnCycle/promptAllySelection에서 관리
    
    prepareNewTurnCycle(); 
}

function prepareNewTurnCycle() {
    if (!isBattleStarted) {
         alert('전투를 시작해 주세요. (prepareNewTurnCycle)');
         return;
    }
    currentTurn++;
    logToBattleLog(`\n=== ${currentTurn} 턴 행동 선택 시작 ===`);
    playerActionsQueue = [];
    actedAlliesThisTurn = []; 

    if(skillSelectionArea) skillSelectionArea.style.display = 'none'; 
    if(executeTurnButton) executeTurnButton.style.display = 'none';
    if(nextTurnButton && nextTurnButton.style.display !== 'none') nextTurnButton.style.display = 'none'; // nextTurnButton은 이제 사용 안 함
    if(skillDescriptionArea) skillDescriptionArea.innerHTML = ''; 
    
    promptAllySelection(); // 아군 선택 UI 호출
}

function promptAllySelection() {
    const aliveAllies = allyCharacters.filter(char => char.isAlive);
    const availableAllies = aliveAllies.filter(char => !actedAlliesThisTurn.includes(char.id));
    
    if (allySelectionButtonsDiv) allySelectionButtonsDiv.innerHTML = ''; 
    if (skillSelectionArea) skillSelectionArea.style.display = 'none';

    if (availableAllies.length === 0 && aliveAllies.length > 0) { // 살아 있는 아군은 있지만 모두 행동 선택 완료
        logToBattleLog('모든 아군 캐릭터의 행동 선택이 완료되었습니다. 턴을 실행하세요.');
        if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none';
        if (executeTurnButton) executeTurnButton.style.display = 'block';
        if (nextTurnButton && nextTurnButton.style.display !== 'none') nextTurnButton.style.display = 'none';
    } else if (aliveAllies.length === 0) { // 살아 있는 아군이 없음 (패배 조건)
        logToBattleLog('행동할 수 있는 아군이 없습니다.');
        if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none';
        if (executeTurnButton) executeTurnButton.style.display = 'block'; // 그래도 턴 실행은 가능하게 (적군 턴 진행 위해)
        if (nextTurnButton && nextTurnButton.style.display !== 'none') nextTurnButton.style.display = 'none';
    }
    else {
        logToBattleLog(`행동할 아군을 선택하세요: ${availableAllies.map(a => a.name).join(', ')}`);
        if (allySelectionButtonsDiv) {
            allySelectionButtonsDiv.style.display = 'block';
            availableAllies.forEach(ally => {
                const button = document.createElement('button');
                button.textContent = `${ally.name} 행동 선택`;
                button.className = 'button'; 
                button.style.margin = '5px';
                button.onclick = () => {
                    if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none'; 
                    showSkillSelectionForCharacter(ally);
                };
                allySelectionButtonsDiv.appendChild(button);
            });
        }
        if (executeTurnButton) executeTurnButton.style.display = 'none';
        if (nextTurnButton && nextTurnButton.style.display !== 'none') nextTurnButton.style.display = 'none';
    }
}

function showSkillSelectionForCharacter(actingChar) {
    if (!actingChar || !actingChar.isAlive) {
        logToBattleLog("선택된 캐릭터가 없거나 전투 불능입니다.");
        promptAllySelection(); 
        return;
    }
    if (actedAlliesThisTurn.includes(actingChar.id)) { // 이미 행동한 경우 (방어적 코딩)
        logToBattleLog(`${actingChar.name}은(는) 이미 이번 턴에 행동했습니다.`);
        promptAllySelection();
        return;
    }

    currentActingCharName.textContent = actingChar.name;
    selectedAction = { type: null, casterId: actingChar.id, skillId: null, targetId: null, subTargetId: null, moveDelta: null };

    availableSkillsDiv.innerHTML = '';
    actingChar.skills.forEach(skillId => {
        const skill = SKILLS[skillId];
        if (skill) {
            const button = document.createElement('button');
            button.textContent = skill.name;
            let cooldownMessage = "";
            let disabledByCooldown = false; 

            if (skill.cooldown && skill.cooldown > 0) { 
                const lastUsed = actingChar.lastSkillTurn[skill.id] || 0;
                if (lastUsed !== 0 && currentTurn - lastUsed < skill.cooldown) {
                    disabledByCooldown = true;
                    cooldownMessage = ` (${skill.cooldown - (currentTurn - lastUsed)}턴 남음)`;
                }
            }
            button.textContent += cooldownMessage;

        // --- 침묵 디버프 체크 로직 추가 ---
        if (actingChar.hasDebuff('silence')) {
            const silencedTypes = ["어그로", "카운터", "지정 버프", "광역 버프", "광역 디버프"]; // 침묵에 영향받는 스킬 타입
            if (silencedTypes.includes(skill.type)) {
                button.disabled = true;
                button.textContent += " (침묵)";
            }
        }

            if (disabledByCooldown) {
                button.disabled = true; 
                button.classList.add('on-cooldown'); 
            } else {
                button.disabled = false; 
                button.classList.remove('on-cooldown');
            }
            button.onclick = () => selectSkill(skill.id, actingChar);
            availableSkillsDiv.appendChild(button);
        }
    });

    movementControlsArea.innerHTML = '<h4><span class="material-icons-outlined">open_with</span>이동</h4>';
    const directions = [
        [-1, -1, '↖'], [0, -1, '↑'], [1, -1, '↗'],
        [-1,  0, '←'],             [1,  0, '→'],
        [-1,  1, '↙'], [0,  1, '↓'], [1,  1, '↘']
    ];
    directions.forEach(dir => {
        const button = document.createElement('button');
        button.textContent = dir[2];
        const targetX = actingChar.posX + dir[0];
        const targetY = actingChar.posY + dir[1];
        // 이동 불가 조건: 맵 밖, 다른 캐릭터 존재
        if (targetX < 0 || targetX >= MAP_WIDTH || targetY < 0 || targetY >= MAP_HEIGHT || 
            (characterPositions[`${targetX},${targetY}`] && characterPositions[`${targetX},${targetY}`] !== actingChar.id)) {
            button.disabled = true;
        }
        button.onclick = () => selectMove({ dx: dir[0], dy: dir[1] }, actingChar);
        movementControlsArea.appendChild(button);
    });

    selectedTargetName.textContent = '없음';
    if(confirmActionButton) confirmActionButton.style.display = 'none'; // 행동 선택 시 우선 숨김
    if(skillSelectionArea) skillSelectionArea.style.display = 'block';
    if(executeTurnButton) executeTurnButton.style.display = 'none'; 
    if(nextTurnButton && nextTurnButton.style.display !== 'none') nextTurnButton.style.display = 'none'; // nextTurnButton은 이제 사용 안 함
    displayCharacters(); // 카드 하이라이트 갱신 위해
}

function selectSkill(skillId, caster) {
    // 이미 같은 스킬이 선택된 상태에서 다시 누르면 선택 취소 (스킬 자체 선택 취소)
    if (selectedAction.type === 'skill' && selectedAction.skillId === skillId && selectedAction.targetId === null && selectedAction.subTargetId === null) {
        logToBattleLog(`[${SKILLS[skillId].name}] 스킬 선택 취소.`);
        selectedAction.type = null;
        selectedAction.skillId = null;
        if (skillDescriptionArea) skillDescriptionArea.innerHTML = '스킬 선택이 취소되었습니다.';
        if (confirmActionButton) confirmActionButton.style.display = 'none';
        selectedTargetName.textContent = '없음';
        return; // 함수 종료
    }
    
    selectedAction.type = 'skill';
    selectedAction.skillId = skillId;
    selectedAction.targetId = null; // 스킬 변경 시 대상 초기화
    selectedAction.subTargetId = null;
    selectedAction.moveDelta = null;

    const skill = SKILLS[skillId];
    logToBattleLog(`${caster.name}, [${skill.name}] 스킬 선택. 대상을 선택해 주세요.`);

    if (skillDescriptionArea) {
        skillDescriptionArea.innerHTML = `<strong>${skill.name}</strong>: ${skill.description || '설명 없음'}`;
    }
    
    if (skill.targetSelection === 'self' || skill.targetType === 'all_allies' || skill.targetType === 'all_enemies') {
        selectedAction.targetId = caster.id; // 자신 또는 전체 대상 스킬은 시전자를 targetId로 임시 저장 가능 (실제 사용은 execute에서)
        selectedTargetName.textContent = skill.targetSelection === 'self' ? caster.name : '전체 대상';
        if (confirmActionButton) confirmActionButton.style.display = 'block';
    } else { // 단일/다중 대상 선택 필요
        selectedTargetName.textContent = '대상 필요';
        if (confirmActionButton) confirmActionButton.style.display = 'none'; // 대상 선택 전에는 확정 불가
    }
    displayCharacters(); // 카드 하이라이트 위해
}

function selectMove(moveDelta, caster) {
    const targetX = caster.posX + moveDelta.dx;
    const targetY = caster.posY + moveDelta.dy;

    // selectMove 자체에서 이동 가능성 최종 체크 (UI 버튼 비활성화와 별개로)
    if (targetX < 0 || targetX >= MAP_WIDTH || targetY < 0 || targetY >= MAP_HEIGHT) {
        logToBattleLog("맵 경계를 벗어날 수 없습니다."); return;
    }
    if (characterPositions[`${targetX},${targetY}`] && characterPositions[`${targetX},${targetY}`] !== caster.id) {
         logToBattleLog("다른 캐릭터가 있는 곳으로 이동할 수 없습니다."); return;
    }

    if (skillDescriptionArea) skillDescriptionArea.innerHTML = '이동이 선택되었습니다.'; 
    
    selectedAction.type = 'move';
    selectedAction.skillId = null;
    selectedAction.targetId = null;
    selectedAction.subTargetId = null;
    selectedAction.moveDelta = moveDelta;

    logToBattleLog(`${caster.name}, (${targetX}, ${targetY})로 이동 선택.`);
    selectedTargetName.textContent = `이동 (${targetX},${targetY})`;
    if(confirmActionButton) confirmActionButton.style.display = 'block';
    displayCharacters();
}

function selectTarget(targetCharId) {
    if (selectedAction.type !== 'skill' || !selectedAction.skillId) return;

    const caster = findCharacterById(selectedAction.casterId);
    const skill = SKILLS[selectedAction.skillId];
    const targetChar = findCharacterById(targetCharId);

    if (!targetChar || !targetChar.isAlive) { 
        logToBattleLog('유효하지 않은 대상입니다 (이미 쓰러졌거나 없음).');
        return; 
    }

    let canConfirm = false;

    // 대상 재클릭 시 선택 취소 로직
    if (selectedAction.targetId === targetCharId) { // 첫 번째 대상이 이미 현재 클릭한 대상과 같다면
        logToBattleLog(`[${targetChar.name}] 대상 선택 취소.`);
        selectedAction.targetId = null;
        selectedAction.subTargetId = null; // 부가 대상도 함께 초기화 (스킬에 따라 다를 수 있음)
        selectedTargetName.textContent = '대상 필요';
        if(confirmActionButton) confirmActionButton.style.display = 'none';
        displayCharacters();
        return;
    }
    if (skill.targetSelection === 'two_enemies' && selectedAction.subTargetId === targetCharId) { // 두 번째 대상이 현재 클릭 대상과 같다면
        logToBattleLog(`두 번째 대상 [${targetChar.name}] 선택 취소.`);
        selectedAction.subTargetId = null;
        const mainTargetName = findCharacterById(selectedAction.targetId)?.name || '첫 번째 대상';
        selectedTargetName.textContent = `${mainTargetName}, 두 번째 대상 필요`;
        if(confirmActionButton) confirmActionButton.style.display = 'none';
        displayCharacters();
        return;
    }


    // 새로운 대상 선택 로직
    if (skill.targetSelection === 'enemy') {
        if (enemyCharacters.includes(targetChar)) {
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            canConfirm = true;
        } else alert('적군을 대상으로 선택해야 합니다.');
    } else if (skill.targetSelection === 'ally') {
        if (allyCharacters.includes(targetChar)) {
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            canConfirm = true;
        } else alert('아군을 대상으로 선택해야 합니다.');
    } else if (skill.targetSelection === 'ally_or_self') {
        if (allyCharacters.includes(targetChar) || caster.id === targetCharId) { // 시전자 자신도 포함
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            canConfirm = true;
        } else alert('아군 또는 자신을 대상으로 선택해야 합니다.');
    } else if (skill.targetSelection === 'two_enemies') {
        if (!enemyCharacters.includes(targetChar)) { alert('적군을 선택해야 합니다.'); return; }
        
        if (!selectedAction.targetId) { // 첫 번째 대상 선택
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            logToBattleLog(`[${skill.name}] 첫 번째 대상: ${targetChar.name}. 두 번째 대상을 선택해 주세요.`);
            // 아직 확정 불가
        } else if (selectedAction.targetId !== targetCharId && !selectedAction.subTargetId) { // 두 번째 대상 선택
            selectedAction.subTargetId = targetCharId;
            const mainTargetName = findCharacterById(selectedAction.targetId).name;
            selectedTargetName.textContent = `${mainTargetName}, ${targetChar.name}`;
            canConfirm = true;
        } else if (selectedAction.targetId === targetCharId) {
            // 이미 위에서 재클릭 취소 로직으로 처리됨
        } else if (selectedAction.subTargetId) {
            alert('이미 두 명의 대상을 모두 선택했습니다. 기존 선택을 취소하려면 대상을 다시 클릭하세요.');
        }
    }

    if(confirmActionButton) confirmActionButton.style.display = canConfirm ? 'block' : 'none';
    displayCharacters(); // 카드 하이라이트 업데이트
}

function confirmAction() {
    if (!selectedAction.type) { alert('행동을 선택해 주세요.'); return; }

    const caster = findCharacterById(selectedAction.casterId);
    if (!caster) { alert('시전자를 찾을 수 없습니다.'); return; }

    // 중복 확정 방지
    if (actedAlliesThisTurn.includes(caster.id)) {
        alert(`${caster.name}은(는) 이미 이번 턴에 행동을 확정했습니다.`);
        promptAllySelection(); // 다시 아군 선택으로
        return;
    }

    let actionDetails = { caster: caster, type: selectedAction.type };
    let targetDescription = "정보 없음"; 

    if (selectedAction.type === 'skill') {
        const skill = SKILLS[selectedAction.skillId];
        if (!skill) { alert('선택된 스킬 정보를 찾을 수 없습니다.'); return; }
        actionDetails.skill = skill;

        if (skill.targetSelection === 'self') {
            targetDescription = caster.name; 
            actionDetails.mainTarget = caster;
        } else if (skill.targetSelection === 'all_allies' || skill.targetSelection === 'all_enemies') {
            targetDescription = "전체 대상";
        } else if (selectedAction.targetId) { 
            const mainTargetObj = findCharacterById(selectedAction.targetId);
            if (!mainTargetObj) { alert('첫 번째 대상을 찾을 수 없습니다.'); return; }
            targetDescription = mainTargetObj.name;
            actionDetails.mainTarget = mainTargetObj;

            if (skill.targetSelection === 'two_enemies') {
                if (selectedAction.subTargetId) {
                    const subTargetObj = findCharacterById(selectedAction.subTargetId);
                    if (!subTargetObj) { alert('두 번째 대상을 찾을 수 없습니다.'); return; }
                    targetDescription += `, ${subTargetObj.name}`; 
                    actionDetails.subTarget = subTargetObj;
                } else {
                    alert('두 번째 대상을 선택해야 합니다.'); return; // 두 대상 선택 스킬인데 부가 대상이 없으면 확정 불가
                }
            }
        } else if (skill.targetSelection !== 'self' && skill.targetType !== 'all_allies' && skill.targetType !== 'all_enemies') {
            // 단일/다중 대상 스킬인데 대상 선택이 안 된 경우
            alert('스킬 대상을 선택해야 합니다.'); return;
        }
        logToBattleLog(`✦준비✦ ${caster.name}, [${skill.name}] 스킬 사용 준비. (대상: ${targetDescription})`);

    } else if (selectedAction.type === 'move') {
        actionDetails.moveDelta = selectedAction.moveDelta;
        if (!selectedAction.moveDelta) {
             alert("이동 정보 오류. 다시 선택해 주세요.");
             showSkillSelectionForCharacter(caster); 
             return;
        }
        const targetX = caster.posX + selectedAction.moveDelta.dx;
        const targetY = caster.posY + selectedAction.moveDelta.dy;
        logToBattleLog(`✦준비✦ ${caster.name}, (${targetX},${targetY})(으)로 이동 준비.`);
    }

    if (skillDescriptionArea) skillDescriptionArea.innerHTML = ''; 
    
    playerActionsQueue.push(actionDetails);
    actedAlliesThisTurn.push(caster.id); // 행동 완료 처리
    
    promptAllySelection(); // 다음 아군 선택 UI 표시
}

async function executeSingleAction(action) {
    const caster = action.caster;
    if (!caster || !caster.isAlive) {
        console.log(`[DEBUG] executeSingleAction: Caster ${caster ? caster.name : 'N/A'} is not alive or not found. Returning false.`);
        return false; 
    }

    // [환원] 효과 처리: 스킬 사용 시 발동
    if (action.type === 'skill' && caster.hasBuff('restoration')) {
        const restorationBuff = caster.buffs.find(b => b.id === 'restoration');
        if (restorationBuff) {
            const aliveAllies = allyCharacters.filter(a => a.isAlive);
            if (aliveAllies.length > 0) {
                let lowestHpAlly = aliveAllies[0];
                for (let i = 1; i < aliveAllies.length; i++) {
                    if (aliveAllies[i].currentHp < lowestHpAlly.currentHp) {
                        lowestHpAlly = aliveAllies[i];
                    }
                }
                const extraHeal = restorationBuff.effect.healPower;
                lowestHpAlly.currentHp = Math.min(lowestHpAlly.maxHp, lowestHpAlly.currentHp + extraHeal);
                logToBattleLog(`✦추가 회복✦ ${caster.name}의 [환원] 효과 발동. ${lowestHpAlly.name}, 체력을 ${extraHeal.toFixed(0)} 회복합니다.`);
            }
        }
    }
    
    applyTurnStartEffects(caster); // 턴 시작 효과 (버프/디버프 턴 감소, 도트 데미지/힐 등)

    logToBattleLog(`\n--- ${caster.name}, 행동 시작 (${currentTurn}턴) ---`);

    if (action.type === 'skill') {
        const skill = action.skill;
        // logToBattleLog(`✦스킬✦ ${caster.name}, ${skill.name} 주문 발동.`); // 스킬 execute 함수 내에서 더 자세히 로그
        let skillSuccess = true; 
        if (skill.execute) {
            let mainTarget = action.mainTarget; // confirmAction에서 설정됨
            let subTarget = action.subTarget;   // confirmAction에서 설정됨
            let actualAllies = allyCharacters.filter(a => a.isAlive); // 항상 최신 아군 목록
            let actualEnemies = enemyCharacters.filter(e => e.isAlive); // 항상 최신 적군 목록

            // 스킬의 targetType에 따라 execute 함수 호출 방식 분기
            // (이 부분은 스킬 정의 시 execute 함수 시그니처를 일관되게 하거나, 여기서 잘 분기해야 함)
            switch (skill.targetType) {
                case 'self':
                case 'all_allies': // 이 스킬들은 execute(caster, allies, enemies, battleLog) 형태일 수 있음
                    skillSuccess = skill.execute(caster, actualAllies, actualEnemies, logToBattleLog);
                    break;
                case 'all_enemies': // execute(caster, enemies, battleLog)
                    skillSuccess = skill.execute(caster, actualEnemies, logToBattleLog);
                    break;
                case 'single_enemy':
                case 'single_ally':
                case 'single_ally_or_self': // execute(caster, target, allies, enemies, battleLog)
                    skillSuccess = skill.execute(caster, mainTarget, actualAllies, actualEnemies, logToBattleLog);
                    break;
                case 'multi_enemy': // 예: 파열 execute(caster, mainTarget, subTarget(내부결정), allies, enemies, battleLog)
                                    // 파열의 경우 subTarget을 파라미터로 받지 않고 내부에서 enemies와 mainTarget을 이용해 결정
                    skillSuccess = skill.execute(caster, mainTarget, actualAllies, actualEnemies, logToBattleLog); // subTarget은 execute 내부에서 처리
                    break;
                default: // 알 수 없는 타입이거나, 모든 파라미터를 받는 일반적인 경우
                    console.warn(`[WARN] Unknown/Unhandled skill targetType: ${skill.targetType} for skill ${skill.name}. Using (caster, mainTarget, allies, enemies, battleLog) signature.`);
                    skillSuccess = skill.execute(caster, mainTarget, actualAllies, actualEnemies, logToBattleLog);
                    break;
            }
        }

        if (skillSuccess === false) { // 스킬 사용 명시적 실패 (쿨타임, 조건 미달 등)
            // logToBattleLog(`${skill.name} 사용에 실패했습니다.`); // execute 함수 내부에서 보통 로그를 남김
        } else { // 스킬 사용 성공 또는 결과가 undefined (void)인 경우
            // 쿨타임 있는 스킬의 경우, 성공 시에만 lastSkillTurn 기록 (execute 함수 내부에서 false 반환 안 한 경우)
            // (SKILL_COUNTER, SKILL_REVERSAL 등은 이제 execute 내부에서 lastSkillTurn을 기록함)
            // 여기서 중복 기록할 필요 없음.
        }

    } else if (action.type === 'move') {
        const oldX = caster.posX; const oldY = caster.posY;
        let newX = caster.posX + action.moveDelta.dx;
        let newY = caster.posY + action.moveDelta.dy;

        if (newX < 0 || newX >= MAP_WIDTH || newY < 0 || newY >= MAP_HEIGHT) {
            logToBattleLog(`❗ ${caster.name}의 이동 실행 실패: (${newX},${newY})는 맵 범위를 벗어납니다.`);
        } else if (characterPositions[`${newX},${newY}`] && characterPositions[`${newX},${newY}`] !== caster.id) {
            logToBattleLog(`❗ ${caster.name}의 이동 실행 실패: (${newX},${newY})에 다른 캐릭터가 있습니다.`);
        } else {
            if (oldX !== -1 && oldY !== -1) delete characterPositions[`${oldX},${oldY}`]; // 이전 위치 정보 삭제
            caster.posX = newX; caster.posY = newY;
            characterPositions[`${newX},${newY}`] = caster.id; // 새 위치 정보 등록
            logToBattleLog(`✦이동✦ ${caster.name}, (${oldX},${oldY})에서 (${newX},${newY})(으)로 이동 완료.`);
        }
    }

    processEndOfTurnEffects(caster); // 턴 종료 효과 (지속 효과 데미지/힐 아님, 스킬 후 즉시 발동하는 턴종료 효과)
    displayCharacters(); // 행동 후 캐릭터 상태 갱신

    if (checkBattleEnd()) {
        return true; // 전투 종료 시 true 반환
    }
    return false; // 전투 계속 시 false 반환
}

async function executeBattleTurn() {
    if (!isBattleStarted) { alert('전투를 시작해 주세요.'); return; }
    
    const aliveAlliesCount = allyCharacters.filter(c => c.isAlive).length;
    if (playerActionsQueue.length < aliveAlliesCount && aliveAlliesCount > 0) { // 살아 있는 아군이 있는데 행동큐가 비어있으면 안됨
         alert('모든 살아 있는 아군의 행동을 선택해 주세요.');
         // 선택 UI를 다시 띄워주거나 하는 처리가 필요할 수 있음
         promptAllySelection();
         return;
    }

    if(skillSelectionArea) skillSelectionArea.style.display = 'none';
    if(executeTurnButton) executeTurnButton.style.display = 'none';
    if(allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none';
    if(skillDescriptionArea) skillDescriptionArea.innerHTML = ''; 

    logToBattleLog(`\n--- ${currentTurn} 턴 아군 행동 실행 ---`);
    // 플레이어 행동 순서는 playerActionsQueue에 담긴 순서대로 (사용자가 선택한 순서)
    for (const action of playerActionsQueue) {
        if (!action.caster.isAlive) continue; // 행동 전 이미 쓰러진 경우 스킵
        if (await executeSingleAction(action)) {
            return; // 전투 종료 시 즉시 함수 종료
        }
    }

    // 전투 종료 재확인 (아군 턴 중 적이 전멸할 수 있음)
    if (checkBattleEnd()) return;

    logToBattleLog(`\n--- ${currentTurn} 턴 적군 행동 실행 ---`);
    for (const enemyChar of enemyCharacters) {
        if (enemyChar.isAlive) {
            if (await performEnemyAction(enemyChar)) { // performEnemyAction도 async/await 처리
                return; // 전투 종료 시 즉시 함수 종료
            }
        }
    }
    
    // 전투 종료 최종 확인
    if (!checkBattleEnd() && isBattleStarted) { 
        prepareNewTurnCycle(); // 다음 턴 준비
    } else {
        // 전투가 여기서 끝났거나, 이미 시작되지 않은 상태면 아무것도 안 함
        if (!isBattleStarted && startButton) startButton.style.display = 'block'; // 전투가 완전히 끝났다면 시작 버튼 다시 표시
        // nextTurnButton, executeTurnButton 등은 이미 숨겨져 있을 것임
    }
}

async function performEnemyAction(enemyChar) {
    if (!enemyChar.isAlive) return false; // 이미 죽었으면 행동 안함

    applyTurnStartEffects(enemyChar); 
    if (!enemyChar.isAlive) return checkBattleEnd(); // 턴 시작 효과로 죽을 수 있음

    logToBattleLog(`\n--- ${enemyChar.name} 행동 (${currentTurn}턴) ---`);

     // --- 기믹 순환 로직 추가 ---
    if (enemyChar.gimmicks && enemyChar.gimmicks.length > 0) {
        const gimmickIndex = (currentTurn - 1) % enemyChar.gimmicks.length;
        const newGimmickId = enemyChar.gimmicks[gimmickIndex];
        enemyChar.activeGimmick = newGimmickId;
        const gimmickData = GIMMICK_DATA[newGimmickId];
        if (gimmickData) {
            logToBattleLog(`\n<pre>${gimmickData.flavorText}</pre>\n`);
        }
    }
    // --- 기믹 로직 끝 ---

    let targetAlly = null; 
    const provokeDebuffOnEnemy = enemyChar.debuffs.find(d => d.id === 'provoked' && d.turnsLeft > 0);
    if (provokeDebuffOnEnemy && provokeDebuffOnEnemy.effect.targetId) {
        targetAlly = findCharacterById(provokeDebuffOnEnemy.effect.targetId);
        if (!targetAlly || !targetAlly.isAlive) {
            targetAlly = null; 
            logToBattleLog(`✦정보✦ ${enemyChar.name}: 도발 대상([${findCharacterById(provokeDebuffOnEnemy.effect.targetId)?.name || '정보없음'}])이 유효하지 않아 새로운 대상을 탐색.`);
        } else {
            logToBattleLog(`✦정보✦ ${enemyChar.name}: [도발] 효과로 ${targetAlly.name}을(를) 우선 공격합니다.`);
        }
    }

    if (!targetAlly) { // 도발 대상이 없거나 유효하지 않으면
        const aliveAllies = allyCharacters.filter(a => a.isAlive);
        if (aliveAllies.length > 0) {
            // 단순 AI: 현재 체력이 가장 낮은 아군을 공격
            targetAlly = aliveAllies.reduce((minChar, currentChar) => 
                (currentChar.currentHp < minChar.currentHp ? currentChar : minChar), aliveAllies[0]);
        }
    }

    if (targetAlly) {
        // 사용 가능한 스킬 중 랜덤 선택 (쿨타임 고려)
        const usableSkills = enemyChar.skills.map(id => SKILLS[id]).filter(skill => {
            if (!skill) return false;
            if (skill.cooldown && skill.cooldown > 0) {
                const lastUsed = enemyChar.lastSkillTurn[skill.id] || 0;
                return !(lastUsed !== 0 && currentTurn - lastUsed < skill.cooldown);
            }
            return true; // 쿨타임 없는 스킬은 사용 가능
        });
        
        let skillToUse = null;
        if (usableSkills.length > 0) {
            skillToUse = usableSkills[Math.floor(Math.random() * usableSkills.length)];
        }

        const aiTargetName = targetAlly.name; 

        if (skillToUse) {
            logToBattleLog(`🔥 ${enemyChar.name}, [${skillToUse.name}] 시전. (대상: ${skillToUse.targetType.includes("enemy") || skillToUse.targetType.includes("single_") ? aiTargetName : (skillToUse.targetType.includes("ally") ? "아군(적AI팀)" : "자신") })`);
            
            let alliesForEnemySkill = enemyCharacters.filter(a => a.isAlive); // 적 AI 입장에서의 아군
            let enemiesForEnemySkill = allyCharacters.filter(a => a.isAlive); // 적 AI 입장에서의 적군 (플레이어 팀)
            let skillSuccessEnemy = true;

            // 스킬 대상 타입에 따른 실행 (executeSingleAction의 switch문과 유사하게 구성)
            // 적 AI가 사용하는 스킬의 mainTarget은 대부분 targetAlly가 됨.
            switch (skillToUse.targetType) {
                case 'self':
                case 'all_allies': // 적 AI에게 all_allies는 다른 적들
                    skillSuccessEnemy = skillToUse.execute(enemyChar, alliesForEnemySkill, enemiesForEnemySkill, logToBattleLog);
                    break;
                case 'all_enemies': // 적 AI에게 all_enemies는 플레이어 아군들
                    skillSuccessEnemy = skillToUse.execute(enemyChar, enemiesForEnemySkill, logToBattleLog);
                    break;
                case 'single_enemy': // 적 AI의 단일 적 = 플레이어 아군 중 targetAlly
                    skillSuccessEnemy = skillToUse.execute(enemyChar, targetAlly, alliesForEnemySkill, enemiesForEnemySkill, logToBattleLog);
                    break;
                // 기타 targetType에 대한 처리 추가 가능
                default: // 기본 공격 또는 특정 대상 지정이 없는 경우 (targetAlly를 대상으로)
                    logToBattleLog(`✦정보✦ ${enemyChar.name}[${skillToUse.name}]: 대상 타입(${skillToUse.targetType}) AI 실행 미지원. ${aiTargetName}에게 기본 공격 시도.`);
                    const damage = calculateDamage(enemyChar, targetAlly, 1.0, 'physical'); // 기본 공격력 100% 물리 피해
                    targetAlly.takeDamage(damage, logToBattleLog, enemyChar);
                    break;
            }
            if (skillSuccessEnemy !== false && skillToUse.cooldown && skillToUse.cooldown > 0) {
                 enemyChar.lastSkillTurn[skillToUse.id] = currentTurn; // AI도 스킬 사용 시 쿨타임 기록
            }

        } else if (targetAlly) { // 사용할 스킬이 없으면 기본 공격
            logToBattleLog(`✦정보✦ ${enemyChar.name}, ${aiTargetName}에게 기본 공격.`);
            const damage = calculateDamage(enemyChar, targetAlly, 1.0, 'physical'); 
            targetAlly.takeDamage(damage, logToBattleLog, enemyChar);
        } else {
            logToBattleLog(`✦정보✦ ${enemyChar.name}: 공격할 대상이 없습니다.`);
        }
    } else { 
        logToBattleLog(`✦정보✦ ${enemyChar.name}: 공격할 플레이어 아군이 없습니다.`);
    }

    processEndOfTurnEffects(enemyChar);
    displayCharacters(); 
    return checkBattleEnd(); // 행동 후 전투 종료 여부 반환
}

function checkBattleEnd() {
    const allEnemiesDead = enemyCharacters.every(char => !char.isAlive);
    const allAlliesDead = allyCharacters.every(char => !char.isAlive);

    if (enemyCharacters.length > 0 && allEnemiesDead) { 
        logToBattleLog('--- 모든 적을 물리쳤습니다. 전투 승리. 🎉 ---');
        endBattle();
        return true;
    } else if (allyCharacters.length > 0 && allAlliesDead) { 
        logToBattleLog('--- 모든 아군이 쓰러졌습니다. 전투 패배. 😭 ---');
        endBattle();
        return true;
    }
    return false; // 전투 계속
}

function endBattle() {
    isBattleStarted = false;
    logToBattleLog("--- 전투 종료 ---");

    if (startButton) startButton.style.display = 'block';
    if (nextTurnButton && nextTurnButton.style.display !== 'none') nextTurnButton.style.display = 'none';
    if (executeTurnButton) executeTurnButton.style.display = 'none';
    if (skillSelectionArea) skillSelectionArea.style.display = 'none';
    if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none';

    currentTurn = 0; 
    playerActionsQueue = [];
    actedAlliesThisTurn = [];
    // 캐릭터 위치 등은 유지하거나, 초기화면으로 돌아가는 로직 추가 가능
}

function findCharacterById(id) {
    return [...allyCharacters, ...enemyCharacters].find(char => char.id === id);
}


// --- 6. 페이지 로드 시 초기화 ---
document.addEventListener('DOMContentLoaded', () => {

    displayCharacters(); // 초기 캐릭터 표시
    if (startButton) startButton.style.display = 'block';
    if (nextTurnButton) nextTurnButton.style.display = 'none';
    if (executeTurnButton) executeTurnButton.style.display = 'none';
    if (skillSelectionArea) skillSelectionArea.style.display = 'none';
    if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none'; // 초기에는 숨김
});
