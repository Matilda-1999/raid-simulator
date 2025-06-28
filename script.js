// --- 0. 상수 정의 ---
let MAP_WIDTH = 5;
let MAP_HEIGHT = 5;
let enemyPreviewAction = null; // 몬스터가 예고한 행동 정보 저장

const TYPE_ADVANTAGE_MODIFIER = 1.3; // 상성일 때 피해량 30% 증가
const TYPE_DISADVANTAGE_MODIFIER = 0.7; // 역상성일 때 피해량 30% 감소
const TYPE_RELATIONSHIPS = {
    '야수': '나무',
    '나무': '천체',
    '천체': '암석',
    '암석': '야수'
};

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
                const shieldAmount = Math.round(caster.currentHp * 2.0 + caster.def * 2.0);
                caster.removeBuffById('iron_fortress'); 
                caster.addBuff('iron_fortress', '[철옹성]', 3, {
                    description: "자신에게 보호막 부여. 3턴간 아군 피해 대신 받음.",
                    shieldAmount: shieldAmount,
                    redirectAllyDamage: true 
                });
                battleLog(`✦스킬✦ ${caster.name}, [근성](홀수) 사용: [철옹성] 효과 발동. 보호막 +${shieldAmount} (3턴). (현재 총 보호막: ${caster.shield.toFixed(0)})`);
            } else { // 짝수 턴: 의지
                const damageTaken = caster.totalDamageTakenThisBattle;
                const shieldAmount = Math.round(damageTaken * 2.5);
                caster.removeBuffById('will_buff');
                caster.addBuff('will_buff', '[의지]', 3, {
                    description: "받은 총 피해 비례 보호막. 해제 시 남은 보호막만큼 체력 흡수 및 받은 피해 총합 초기화.",
                    shieldAmount: shieldAmount,
                    healOnRemove: true, 
                    resetsTotalDamageTaken: true 
                });
                battleLog(`✦스킬✦ ${caster.name}, [근성](짝수) 사용: [의지] 효과 발동. (받은 피해: ${damageTaken}) 보호막 +${shieldAmount} (3턴). (현재 총 보호막: ${caster.shield.toFixed(0)})`);
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

            const lastUsed = caster.lastSkillTurn[SKILLS.SKILL_COUNTER.id] || 0;
            if (lastUsed !== 0 && currentTurn - lastUsed < SKILLS.SKILL_COUNTER.cooldown) {
                battleLog(`✦정보✦ ${caster.name}, [${skillName}] 사용 불가: 쿨타임 ${SKILLS.SKILL_COUNTER.cooldown - (currentTurn - lastUsed)}턴 남음.`);
                return false;
            }

            const baseShieldAmountFromCaster = caster.shield; 

            if (baseShieldAmountFromCaster > 0) {
                const allLivingAlliesIncludingCaster = allies.filter(a => a.isAlive);
                if (allLivingAlliesIncludingCaster.length > 0) {
                    const shieldPerAlly = Math.round(baseShieldAmountFromCaster / allLivingAlliesIncludingCaster.length);
                    battleLog(`✦효과✦ ${caster.name}, [${skillName}]의 보호막 분배: 자신의 보호막(${baseShieldAmountFromCaster}) 기반으로 아군 ${allLivingAlliesIncludingCaster.length}명에게 2턴 보호막 버프 부여.`);
                    allLivingAlliesIncludingCaster.forEach(ally => {
                        const buffId = `counter_shield_${caster.id}_to_${ally.id}_${currentTurn}`;
                        ally.addBuff(
                            buffId,
                            '[반격 보호막]',
                            2,
                            { shieldAmount: shieldPerAlly }
                        );
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
            caster.lastSkillTurn[SKILLS.SKILL_COUNTER.id] = currentTurn;
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
                enemy.addDebuff('provoked', '도발 (타겟 고정)', 2, { targetId: caster.id });
            });
            caster.aggroDamageStored = 0;
            battleLog(`✦효과✦ ${caster.name}, [도발] 사용: 모든 적을 도발합니다. 자신은 받는 피해가 감소합니다.`);
            return true;
        }
    },
    
    // [역습]
    SKILL_REVERSAL: {
        id: "SKILL_REVERSAL",
        name: "역습",
        type: "카운터",
        description: "타이밍은 대사가 아니다. 하지만 좋은 대사는 늘 제때에 맞는다.<br><br>자신의 현재 체력 0.5로 감소. <br>해당 턴에 자신이 공격받은 후, 홀수 턴에는 (공격력 + [도발] 저장 피해)x1.5 물리 피해. <br>짝수 턴에는 (마법 공격력 + [도발] 저장 피해)x1.5 마법 피해를 공격한 적군에게 줌. <br>반격 후, 도발 저장량 초기화. (쿨타임 1턴)",
        targetType: "self",
        targetSelection: "self",
        cooldown: 2, // 사용 후 1턴간 사용 불가
        execute: (caster, allies, enemies, battleLog) => {
            const lastUsed = caster.lastSkillTurn[SKILLS.SKILL_REVERSAL.id] || 0;
            if (lastUsed !== 0 && currentTurn - lastUsed < SKILLS.SKILL_REVERSAL.cooldown) {
                battleLog(`✦정보✦ ${caster.name}, [역습] 사용 불가: 쿨타임 ${SKILLS.SKILL_REVERSAL.cooldown - (currentTurn - lastUsed)}턴 남음.`);
                return false;
            }

            const hpLoss = Math.round(caster.currentHp * 0.5);
            caster.currentHp -= hpLoss;
            if (caster.currentHp < 1) caster.currentHp = 1;
            battleLog(`✦소모✦ ${caster.name}, [역습] 사용 준비: 체력 ${hpLoss} 소모. (현재 HP: ${caster.currentHp.toFixed(0)})`);
            caster.addBuff('reversal_active', '역습 대기', 1, {});
            caster.lastSkillTurn[SKILLS.SKILL_REVERSAL.id] = currentTurn;
            return true;
        }
    },
    
    // [허상]
    SKILL_ILLUSION: {
        id: "SKILL_ILLUSION",
        name: "허상",
        type: "지정 버프",
        description: "무엇을 찾으려 했는가. 애초에 목적을 알고 있었는가?<br><br>1. 단일 강화, 자신에게 사용 시 (공격)x0.5만큼 체력 회복.<br>2. 다른 아군에게 사용 시 자신의 (공격)x0.2만큼 체력을 잃고 아군의 (공격)x2.0 증가. 단, 받은 피해가 짝수일 시 마법 공격력, 홀수일 시 공격력 증가. 첫 턴에는 사용 불가능. 2 턴 지속.<br>3. 턴 종료 시 목표 적군에게 (공격)x0.5 추가 공격 개시.",
        targetType: "single_ally_or_self",
        targetSelection: "ally_or_self",
        execute: (caster, target, allies, enemies, battleLog) => {
            console.log(`[DEBUG] 허상 스킬 실행: 시전자(${caster.name}), 대상(${target?.name}), 현재 턴(${currentTurn})`);

            if (!target) {
                battleLog(`✦정보✦ ${caster.name} [허상]: 스킬 대상을 찾을 수 없습니다.`);
                return false;
            }

            // 2번 조건: 첫 턴에 다른 아군에게 사용 불가
            if (caster.id !== target.id && currentTurn <= 1) {
                battleLog(`✦정보✦ ${caster.name} [허상]: 첫 턴에는 다른 아군에게 사용할 수 없습니다.`);
                console.log(`[DEBUG] 허상: 첫 턴(${currentTurn})에 아군 대상 지정으로 사용 불가.`);
                return false;
            }
            
            if (caster.id === target.id) { // 자신에게 사용
                const healAmount = Math.round(caster.getEffectiveStat('atk') * 0.5);
                caster.currentHp = Math.min(caster.maxHp, caster.currentHp + healAmount);
                battleLog(`✦회복✦ ${caster.name}, [허상] 사용 (자신): 체력 ${healAmount} 회복. (HP: ${caster.currentHp.toFixed(0)})`);
            } else { // 다른 아군에게 사용
                const hpLoss = Math.round(caster.getEffectiveStat('atk') * 0.2);
                caster.currentHp -= hpLoss;
                if (caster.currentHp < 1) caster.currentHp = 1;
                battleLog(`✦소모✦ ${caster.name}, [허상] 사용 (${target.name} 대상): 체력 ${hpLoss} 소모. (HP: ${caster.currentHp.toFixed(0)})`);
                
                // 받은 피해 총합의 홀짝에 따라 버프 종류 결정
                const totalDamageTaken = caster.totalDamageTakenThisBattle;
                console.log(`[DEBUG] 허상: 시전자의 받은 피해 총합(${totalDamageTaken})`);
                if (totalDamageTaken % 2 === 0) { // 짝수: 마법 공격력 증가
                    target.addBuff('illusion_matk_boost', '마법 공격력 증가 (허상)', 2, { 
                        type: 'matk_boost_multiplier',
                        value: 2.0
                     });
                    battleLog(`✦버프✦ ${target.name}: [허상 효과] 마법 공격력 2배 증가 (2턴).`);
                } else { // 홀수: 공격력 증가
                    target.addBuff('illusion_atk_boost', '공격력 증가 (허상)', 2, { 
                        type: 'atk_boost_multiplier',
                        value: 2.0
                     });
                    battleLog(`✦버프✦ ${target.name}: [허상 효과] 공격력 2배 증가 (2턴).`);
                }
            }

            // 3번 조건: 턴 종료 추가 공격
            const firstAliveEnemy = enemies.find(e => e.isAlive);
            if (firstAliveEnemy) {
                 caster.addBuff('illusion_end_turn_attack', '턴 종료 추가 공격 (허상)', 1, { 
                     attackerId: caster.id, 
                     originalTargetId: target.id,
                     enemyTargetId: firstAliveEnemy.id,
                     power: 0.5,
                     damageType: 'physical'
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
            
            const removableDebuffs = target.debuffs.filter(d => ['상태 이상', '제어', '속성 감소'].includes(d.effect.category || '기타'));
            let removedCount = 0;
            for (let i = removableDebuffs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [removableDebuffs[i], removableDebuffs[j]] = [removableDebuffs[j], removableDebuffs[i]];
            }
            for (let i = 0; i < Math.min(2, removableDebuffs.length); i++) {
                const debuffToRemove = removableDebuffs[i];
                target.removeDebuffById(debuffToRemove.id);
                battleLog(`✦정화✦ ${target.name}: [${debuffToRemove.name}] 디버프 정화됨.`);
                removedCount++;
            }
            if (removedCount === 0 && removableDebuffs.length > 0) {
                 battleLog(`✦정보✦ ${target.name}: 정화할 수 있는 디버프가 없습니다(선택실패).`);
            } else if (removableDebuffs.length === 0) {
                 battleLog(`✦정보✦ ${target.name}: 정화할 수 있는 디버프가 없습니다.`);
            }

            const buffChoices = [
                { id: 'nihility_heal_hot', name: '턴 시작 시 HP 회복 (허무)', turns: 2, effect: { type: 'turn_start_heal', value: Math.round(caster.getEffectiveStat('atk') * 0.5) } },
                { id: 'nihility_reflect_dmg', name: '피해 반사 (허무)', turns: 2, effect: { type: 'damage_reflect', value: 0.3 } },
                { id: 'nihility_def_boost', name: '방어력 증가 (허무)', turns: 2, effect: { type: 'def_boost_multiplier', value: 1.3 } },
                { id: 'nihility_atk_boost', name: '공격력 증가 (허무)', turns: 2, effect: { type: 'atk_boost_multiplier', value: 1.5 } }
            ];
            const chosenBuffData = buffChoices[Math.floor(Math.random() * buffChoices.length)];
            target.addBuff(chosenBuffData.id, chosenBuffData.name, chosenBuffData.turns, chosenBuffData.effect);
            battleLog(`✦버프✦ ${target.name}: [허무] 효과로 [${chosenBuffData.name}] 획득(2턴).`);
            return true;
        }
    },
    
    // [실존]
    SKILL_REALITY: {
        id: "SKILL_REALITY",
        name: "실존",
        type: "광역 버프",
        description: "보아라, 눈앞에 놓여진 것을. 그리고 말하라, 당신이 깨달은 것을.<br><br>모든 아군 방어력 x0.3 증가 (2턴). <br>자신은 [실재] 4스택 추가 획득 (2턴, 해제 불가). <br>연속 사용 시 추가 2스택 획득. (쿨타임 2턴)",
        targetType: "all_allies",
        targetSelection: "all_allies",
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
                    type: 'def_boost_multiplier',
                    value: 1.3
                });
            });
            battleLog(`✦버프✦ 모든 아군: 방어력 30% 증가(2턴).`);

            let realityStacksToAdd = 4;
            const realityBuff = caster.buffs.find(b => b.id === 'reality_stacks');
            if (realityBuff && realityBuff.lastAppliedTurn === currentTurnNum -1) {
                 realityStacksToAdd +=2;
                 battleLog(`✦효과✦ ${caster.name} [실존] 연속 사용: [실재] 추가 2스택.`);
            }

            caster.addBuff('reality_stacks', '[실재]', 2, {
                atkBoostPerStack: 0.4,
                matkBoostPerStack: 0.4,
                stacks: realityStacksToAdd, 
                unremovable: true,
                lastAppliedTurn: currentTurnNum
            }, true);

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
        description: "아래는 진창이었음을. 드디어 깨달은 당신에게 선사하는 아름다운 정론이다.<br><br>1. 광역 디버프<br>2. 모든 적군에게 2턴 동안 [중독](턴 종료 시 대상의 최대 체력의 1.5% 만큼의 고정 피해) 상태 부여.<br>3. 중독 결산 후 랜덤 적군에게 [맹독](사용자의 공격)x0.3 추가 공격 부여.",
        targetType: "all_enemies",
        targetSelection: "all_enemies",
        execute: (caster, enemies, battleLog) => {
            battleLog(`✦스킬✦ ${caster.name}, [진리] 사용: 모든 적에게 [중독]을 부여합니다.`);
            const attackStat = caster.getEffectiveStat('atk');
            console.log(`[DEBUG] 진리: [중독] 피해 계산 기반 공격력: ${attackStat}`);

            enemies.filter(e => e.isAlive).forEach(enemy => {
                enemy.addDebuff('poison_truth', '[중독](진리)', 2, { 
                    damagePerTurn: attackStat * 0.5, 
                    type: 'fixed',
                    casterId: caster.id,
                    category: '상태 이상'
                });
                battleLog(`✦상태 이상✦ ${enemy.name}, [중독](진리) 효과 적용 (2턴).`);
            });
            // 턴 종료 후 [맹독] 공격을 위한 마커 추가
            caster.addBuff('truth_end_turn_attack_marker', '맹독 추가 공격 대기', 1, { 
                originalCasterId: caster.id,
                power: 0.3
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
            battleLog(`✦피해✦ ${caster.name}, [서막]: ${target.name}에게 ${damage} ${damageType === 'physical' ? '물리' : '마법'} 피해.`);

            // 시전자의 '영감(타입)'에 따라 감소시킬 방어력 종류를 결정
            let defenseToReduce;
            if (caster.type === "암석" || caster.type === "야수") {
                defenseToReduce = 'def'; // 물리 방어력
            } else if (caster.type === "천체" || caster.type === "나무") {
                defenseToReduce = 'mdef'; // 마법 방어력
            } else {
                // '영감'이 지정되지 않은 경우, 더 높은 공격력 스탯을 기준으로 결정
                defenseToReduce = damageType === 'physical' ? 'def' : 'mdef';
            }

            // 디버프에 어떤 방어력을 감소시킬지('reductionType'), 감소율은 얼마인지('reductionPerStack') 정보 추가
            target.addDebuff('scratch', '[흠집]', 2, { 
                maxStacks: 3, 
                overrideDuration: true,
                removerSkillId: SKILLS.SKILL_CLIMAX.id,
                category: '표식',
                reductionType: defenseToReduce,       // 'def' 또는 'mdef' 저장
                reductionValue: 0.10               // 스택당 10% 감소
            });
            const scratchStacks = target.getDebuffStacks('scratch');
            const defenseTypeKorean = defenseToReduce === 'def' ? '방어력' : '마법 방어력';
            battleLog(`✦디버프✦ ${target.name}, [흠집] 효과 적용 (${defenseTypeKorean} 감소). (현재 ${scratchStacks}스택).`);
            
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
            if (!target.isAlive) { battleLog(`✦정보✦ ${caster.name} [절정]: 대상(${target.name})이 이미 쓰러져 있습니다.`); return false; }

            let statTypeToUse;
            let damageType;

            if (caster.type === "암석" || caster.type === "야수") {
                statTypeToUse = 'atk';
                damageType = 'physical';
            } else if (caster.type === "천체" || caster.type === "나무") {
                statTypeToUse = 'matk';
                damageType = 'magical';
            } else {
                statTypeToUse = caster.getEffectiveStat('atk') >= caster.getEffectiveStat('matk') ? 'atk' : 'matk';
                damageType = statTypeToUse === 'atk' ? 'physical' : 'magical';
            }
            const damageTypeKorean = damageType === 'physical' ? '물리' : '마법';

            const mainSkillPower = 2.7;
            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [절정] 공격.`);
            const mainDamage = calculateDamage(caster, target, mainSkillPower, damageType, statTypeToUse);
            target.takeDamage(mainDamage, battleLog, caster);
            battleLog(`  ✦피해✦ [절정]: ${target.name}에게 ${mainDamage} ${damageTypeKorean} 피해.`);

            if (!target.isAlive) return true;

            const scratchStacks = target.getDebuffStacks('scratch');
            if (scratchStacks > 0) {
                battleLog(`✦효과✦ ${target.name} [흠집 ${scratchStacks}스택]: 추가타 발생.`);
                let bonusSkillPowerPercent = 0;
                if (scratchStacks === 1) bonusSkillPowerPercent = 0.25;
                else if (scratchStacks === 2) bonusSkillPowerPercent = 0.35;
                else if (scratchStacks >= 3) bonusSkillPowerPercent = 0.45;

                for (let i = 0; i < 2; i++) {
                    const bonusDamage = calculateDamage(caster, target, bonusSkillPowerPercent, damageType, statTypeToUse);
                    target.takeDamage(bonusDamage, battleLog, caster);
                    battleLog(`  ✦추가 피해✦ [흠집 효과] ${i + 1}회: ${target.name}에게 ${bonusDamage} 추가 ${damageTypeKorean} 피해.`);
                    if (!target.isAlive) break;
                }

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
        description: "숨죽인 무대에는 벌어질 틈이 감춰져 있다.<br><br>공격력/마법 공격력 260% 공격(2타). 이후 공격력/마법 공격력 200%의 피해를 가하며 상대에게 [쇠약] 상태 부여. <br>[쇠약]: 지속 2 턴. 공격 시 피해량 -20%.",
        targetType: "single_enemy",
        targetSelection: "enemy",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) { battleLog(`✦정보✦ ${caster.name} [간파]: 스킬 대상을 찾을 수 없습니다.`); return false; }
            if (!target.isAlive) { battleLog(`✦정보✦ ${caster.name} [간파]: 대상(${target.name})이 이미 쓰러져 있습니다.`); return false;}

            const damageType = caster.getEffectiveStat('atk') >= caster.getEffectiveStat('matk') ? 'physical' : 'magical';
            const damageTypeKorean = damageType === 'physical' ? '물리' : '마법';
            const skillPower1 = damageType === 'physical' ? 2.6 : 2.6;

            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [간파] 2연타 공격.`);
            for (let i=0; i<2; i++) {
                const damage1 = calculateDamage(caster, target, skillPower1 / 2, damageType);
                target.takeDamage(damage1, battleLog, caster);
                battleLog(`  ✦피해✦ [간파] ${i+1}타: ${target.name}에게 ${damage1} ${damageTypeKorean} 피해.`);
                if (!target.isAlive) return true;
            }

            const skillPower2 = damageType === 'physical' ? 2.0 : 2.0;
            const damage2 = calculateDamage(caster, target, skillPower2, damageType);
            target.takeDamage(damage2, battleLog, caster);
            battleLog(`✦추가 피해✦ ${caster.name} [간파 효과]: ${target.name}에게 ${damage2} 추가 ${damageTypeKorean} 피해.`);
            if (!target.isAlive) return true;
            
            target.addDebuff('weakness', '[쇠약]', 2, { 
                damageMultiplierReduction: 0.2,
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
        targetType: "single_enemy",
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

            const mainSkillPower = 2.1;
            const mainDamage = calculateDamage(caster, mainTarget, mainSkillPower, damageType, statTypeToUse);
            mainTarget.takeDamage(mainDamage, battleLog, caster);
            battleLog(`  ✦피해✦ [파열 주 대상] ${mainTarget.name}: ${mainDamage} ${damageTypeKorean} 피해.`);

            if (mainTarget.isAlive && mainTarget.hasDebuff('weakness')) {
                const bonusFixedDamageValue = caster.getEffectiveStat(statTypeToUse) * 0.3;
                const actualBonusFixedDamage = calculateDamage(caster, mainTarget, bonusFixedDamageValue, 'fixed');
                mainTarget.takeDamage(actualBonusFixedDamage, battleLog, caster);
                battleLog(`  ✦추가 피해✦ ${mainTarget.name} ([쇠약] 대상): ${actualBonusFixedDamage} 추가 고정 피해.`);
            }

            const subTargets = enemies.filter(e => e.isAlive && e.id !== mainTarget.id);
            if (subTargets.length > 0) {
                battleLog(`  ✦파열 부가 대상 공격 시작 (총 ${subTargets.length}명)`);
                const subSkillPower = 1.4;
                subTargets.forEach(subTarget => {
                    if (!subTarget.isAlive) return;
                    const subDamage = calculateDamage(caster, subTarget, subSkillPower, damageType, statTypeToUse);
                    subTarget.takeDamage(subDamage, battleLog, caster);
                    battleLog(`    ✦피해✦ [파열 부 대상] ${subTarget.name}: ${subDamage} ${damageTypeKorean} 피해.`);

                    if (subTarget.isAlive && subTarget.hasDebuff('weakness')) {
                        const bonusFixedDamageValueSub = caster.getEffectiveStat(statTypeToUse) * 0.3;
                        const actualBonusFixedDamageSub = calculateDamage(caster, subTarget, bonusFixedDamageValueSub, 'fixed');
                        subTarget.takeDamage(actualBonusFixedDamageSub, battleLog, caster);
                        battleLog(`    ✦추가 피해✦ ${subTarget.name} ([쇠약] 대상): ${actualBonusFixedDamageSub} 추가 고정 피해.`);
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
        description: "두 사람의 완벽한 조화는 곧 전체의 완성이다.<br><br>1) 지정 대상이 (잃은 체력x50%) 회복<br>2) 모든 상태 이상 정화<br>3) 시전자 [환원] 상태 진입. <br> [환원] 상태 시, 스킬 시전할 때 가장 낮은 체력 아군 (시전자 방어력x60%) 추가 회복 3턴 지속, 연달아 사용하더라도 최대 3턴. <br><b>* 기믹 오브젝트 '메마른 생명의 샘'에 사용 가능</b>",
        targetType: "single_ally_or_gimmick",
        targetSelection: "single_ally_or_gimmick",
        execute: (caster, target, allies, enemies, battleLog) => {
            if (!target) {
                battleLog(`✦정보✦ ${caster.name} [공명]: 대상을 찾을 수 없습니다.`);
                return false;
            }

            // 대상이 '메마른 생명의 샘'인 경우
            if (target.type === 'spring') {
                const healAmount = Math.round(caster.getEffectiveStat('def') * 2); // 샘은 방어력 기반으로 치유
                target.healingReceived += healAmount;
                battleLog(`✦스킬✦ ${caster.name}, [${target.name}]에 [공명] 사용.`);
                logToBattleLog(`✦회복✦ [${target.name}]에 생명력을 ${healAmount} 주입합니다. (현재: ${target.healingReceived}/${target.healingGoal})`);
                displayCharacters(); // 샘의 숫자 UI 업데이트
                return true;
            }

            // 대상이 일반 아군인 경우 (기존 로직)
            if (!target.isAlive) {
                 battleLog(`✦정보✦ ${caster.name} [공명]: 대상이 쓰러져 있습니다.`);
                return false;
            }
            
            const lostHp = target.maxHp - target.currentHp;
            const healAmount = Math.round(lostHp * 0.5);
            target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [공명] 사용.`);
            battleLog(`✦회복✦ ${target.name}: 체력 ${healAmount} 회복. (HP: ${target.currentHp.toFixed(0)})`);

            if (target.debuffs.length > 0) {
                const cleansedDebuffs = target.debuffs.map(d => d.name).join(', ');
                target.debuffs = [];
                battleLog(`✦정화✦ ${target.name}: 모든 디버프(${cleansedDebuffs})가 정화되었습니다.`);
            }

            caster.addBuff('restoration', '[환원]', 3, {
                description: "스킬 시전 시 체력이 가장 낮은 아군 추가 회복 (3턴).",
                healPower: Math.round(caster.getEffectiveStat('def') * 0.6)
            });
            battleLog(`✦버프✦ ${caster.name}: [환원] 상태가 되어 3턴간 스킬 사용 시 아군을 추가 회복합니다.`);
            
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
            
            battleLog(`✦스킬✦ ${caster.name}, ${target.name}에게 [보상] 사용.`);
            
            const selfDamage = Math.round(caster.maxHp * 0.15);
            caster.takeDamage(selfDamage, battleLog, null);
            battleLog(`✦소모✦ ${caster.name}: 스킬 대가로 ${selfDamage}의 피해를 입습니다.`);
            
            if (!caster.isAlive) return true;

            target.addDebuff('transfer', '[전이]', 2, {
                description: "피격 시 공격자를 (자신의 공격력x100%)만큼 회복시킴.",
                casterId: caster.id
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
        description: "희생은 언제나 숭고하다. 그러나 희생자는 누가 구할 것인가.<br><br>1) 시전자 (전체 체력x20%) 차감<br>2) 시전자 제외 전원 (잃은 체력x70%) 회복<br>3) [면역] 1회 부여. <br>[면역] 상태 시, 이후 상태 이상 1회 무조건 적용되지 않음. <br><b>* 기믹 오브젝트 '메마른 생명의 샘'에 회복 효과 적용 가능</b>",
        targetType: "all_allies",
        targetSelection: "all_allies",
        execute: (caster, allies, enemies, battleLog) => {
            battleLog(`✦스킬✦ ${caster.name}, [침전] 사용.`);

            const hpCost = Math.round(caster.maxHp * 0.2); 
            caster.currentHp -= hpCost;
            battleLog(`✦소모✦ ${caster.name}: 자신을 희생하여 체력 ${hpCost}을 소모합니다.`);
            if (caster.currentHp <= 0) {
                caster.currentHp = 1;
                battleLog(`✦효과✦ ${caster.name}, 쓰러지기 직전이지만 효과는 발동됩니다.`);
            }

            // 1. 아군에게 효과 적용 (기존 로직)
            allies.filter(a => a.isAlive && a.id !== caster.id).forEach(ally => {
                const lostHp = ally.maxHp - ally.currentHp;
                if (lostHp > 0) {
                    const healAmount = Math.round(lostHp * 0.7); 
                    ally.currentHp = Math.min(ally.maxHp, ally.currentHp + healAmount);
                    battleLog(`✦회복✦ ${ally.name}: 체력 ${healAmount} 회복. (HP: ${ally.currentHp.toFixed(0)})`);
                }
                ally.addBuff('immunity', '[면역]', 2, {
                    description: "다음 상태 이상 공격을 1회 무효화합니다.",
                    singleUse: true
                });
                battleLog(`✦버프✦ ${ally.name}: [면역](1회) 효과를 얻었습니다.`);
            });

            // 2. 기믹 오브젝트에게 효과 적용 (새로운 로직)
            // 설명과 기능을 일치시키기 위해, 맵에 '메마른 생명의 샘'이 존재하면 체력 소모량만큼 회복
            const spring = mapObjects.find(obj => obj.type === 'spring');
            if (spring) {
                const healAmount = hpCost; // 시전자가 소모한 체력만큼 샘을 회복
                spring.healingReceived += healAmount;
                battleLog(`✦회복✦ [${spring.name}]에 생명력을 ${healAmount} 주입합니다. (현재: ${spring.healingReceived}/${spring.healingGoal})`);
            }
            
            displayCharacters(); // UI 즉시 갱신
            return true;
        }
    },

    // [차연]
    SKILL_DIFFERANCE: {
        id: "SKILL_DIFFERANCE",
        name: "차연",
        type: "광역 버프",
        description: "자기희생의 완결은 영원히 지연된다. 우리의 마음에 남아.<br><br>1) 시전자 (전체 체력x15%) 타격(고정 피해)<br>2) 시전자 (전체 체력x30%) 회복<br>3) 전원 [흔적] 상태 진입. <br>[흔적] 상태 시, 피격당한 아군의 현재 체력이 50% 이하라면 시전자가 (전체 체력x5%)를 잃고 아군 (전체 체력x25%) 회복 3턴 지속, 연달아 사용하더라도 최대 3턴",
        targetType: "all_allies",
        targetSelection: "all_allies",
        execute: (caster, allies, enemies, battleLog) => {
            battleLog(`✦스킬✦ ${caster.name}, [차연] 발동.`);
            
            const selfDamage = Math.round(caster.maxHp * 0.15);
            caster.takeDamage(selfDamage, battleLog, null);
            battleLog(`✦소모✦ ${caster.name}: 스킬 사용을 위해 ${selfDamage}의 피해를 입습니다.`);
            
            if (!caster.isAlive) return true;

            const selfHeal = Math.round(caster.maxHp * 0.3);
            caster.currentHp = Math.min(caster.maxHp, caster.currentHp + selfHeal);
            battleLog(`✦회복✦ ${caster.name}: 체력 ${selfHeal} 회복. (HP: ${caster.currentHp.toFixed(0)})`);

            const allCharacters = [...allies, ...enemies];
            allCharacters.filter(c => c.isAlive).forEach(character => {
                character.addBuff('trace', '[흔적]', 3, {
                    description: "체력이 50% 이하일 때 피격 시, [차연] 시전자가 희생하여 자신을 회복시킴 (3턴).",
                    originalCasterId: caster.id
                });
                battleLog(`✦버프✦ ${character.name}: [흔적] 상태가 되었습니다. (3턴)`);
            });

            return true;
        }
    }
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
            const hitArea = "1,1;2,1;3,1;1,2;3,2;1,3;2,3;3,3".split(';').map(s => {
                const [x, y] = s.split(',').map(Number);
                return { x, y };
            });
            const damage = caster.getEffectiveStat('atk');
            
            enemies.forEach(target => {
                if (hitArea.some(pos => pos.x === target.posX && pos.y === target.posY)) {
                    battleLog(`✦광역 피해✦ ${caster.name}의 [균열의 진동]이 ${target.name}에게 적중.`);
                    target.takeDamage(damage, battleLog, caster);
                }
            });
                
            return true;
        }
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
            const hitArea = "0,2;1,1;3,1;2,0;4,2;1,3;3,3".split(';').map(s => {
                const [x, y] = s.split(',').map(Number);
                return { x, y };
            });
            const targets = enemies.filter(target => hitArea.some(pos => pos.x === target.posX && pos.y === target.posY));
            const silenceDuration = targets.length;

            if (silenceDuration > 0) {
                targets.forEach(target => {
                    battleLog(`✦광역 디버프✦ ${caster.name}의 [침묵의 메아리]가 ${target.name}에게 적중.`);
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
        name: "무너지는 하늘",
        type: "광역 공격",
        script: `\n<pre>거대한 석괴가 하늘에서 떨어지기 시작한다.\n때로 자연이라는 것은, 인간에게 이다지도 무자비하다.\n"대지가 너희에게 분노하리라."</pre>\n`,
        description: "피격 범위 내 모든 적에게 공격력만큼 피해를 줍니다.",
        targetType: "all_enemies",
        targetSelection: "all_enemies",
         execute: (caster, allies, enemies, battleLog) => {
            const hitArea = "2,0;2,1;0,2;1,2;3,2;4,2;2,3;2,4".split(';').map(s => {
                const [x, y] = s.split(',').map(Number);
                return { x, y };
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

    SKILL_Birth_of_Vines: {
        id: "SKILL_Birth_of_Vines",
        name: "덩굴 탄생",
        type: "광역 공격",
        script: `\n<pre>바닥으로부터 수많은 덩굴이 솟구친다.\n벗어날 수 없는 공포가 당신의 발목을 옥죄어 온다.\n"이 땅에 모습을 드러낸 이들을, 잊지 않겠다."</pre>\n`,
        description: "지정된 범위에 마법 공격력만큼 피해를 줍니다.",
        targetType: "all_enemies",
        execute: (caster, allies, enemies, battleLog) => {
            const hitArea = "0,0;0,2;0,4;1,1;1,3;2,0;2,2;2,4;3,1;3,3;4,0;4,2;4,4".split(';').map(s => {
                const [x, y] = s.split(',').map(Number);
                return { x, y };
            });
            const damage = caster.getEffectiveStat('matk');
            
            enemies.forEach(target => {
                if (target.isAlive && hitArea.some(pos => pos.x === target.posX && pos.y === target.posY)) {
                    battleLog(`✦광역 피해✦ ${caster.name}의 [덩굴 탄생]이 ${target.name}에게 적중!`);
                    target.takeDamage(damage, battleLog, caster);
                }
            });
            return true;
        }
    },
        
    SKILL_Spores_of_Silence: {
        id: "SKILL_Spores_of_Silence",
        name: "침묵의 포자",
        type: "광역 디버프",
        script: `\n<pre>고운 꽃가루가 하늘을 뒤덮는다.\n생경한 아름다움은 고요한 찬사만을 강요한다.\n"많은 말은 필요하지 않은 법."</pre>\n`,
        description: "지정된 범위의 대상에게 [무장 해제] 디버프를 부여합니다. 지속 턴은 피격된 인원 수와 같습니다.",
        targetType: "all_enemies",
        execute: (caster, allies, enemies, battleLog) => {
            const hitArea = "0,0;1,0;2,0;3,0;4,0;0,2;1,2;3,2;4,2;0,4;1,4;2,4;3,4;4,4".split(';').map(s => {
                const [x, y] = s.split(',').map(Number);
                return { x, y };
            });
            
            const targets = enemies.filter(target => target.isAlive && hitArea.some(pos => pos.x === target.posX && pos.y === target.posY));
            const debuffDuration = targets.length;

            if (debuffDuration > 0) {
                 battleLog(`✦광역 디버프✦ ${caster.name}의 [침묵의 포자]가 ${targets.map(t=>t.name).join(', ')}에게 적중!`);
                targets.forEach(target => {
                    target.addDebuff('disarm', '[무장 해제]', debuffDuration, {
                        description: `공격 유형 스킬 사용 불가 (${debuffDuration}턴)`
                    });
                });
            } else {
                battleLog(`✦효과 없음✦ [침묵의 포자]의 영향을 받은 대상이 없습니다.`);
            }
            return true;
        }
    },

    SKILL_Slapstick_Comdey_P: {
        id: "SKILL_Slapstick_Comdey_P",
        name: "슬랩스틱 코미디(피에로)",
        type: "광역 공격",
        script: `\n<pre>와장창! 어때, 어때? 놀랐지?!</pre>\n`,
        description: "자신을 기준으로 고정된 범위에 물리 피해를 줍니다.",
        execute: (caster, allies, enemies, battleLog) => {
            const relativeOffsets = [{dx: 0, dy: -2}, {dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: 0, dy: 2}];
            const damage = caster.getEffectiveStat('atk');

            enemies.forEach(target => {
                const isHit = relativeOffsets.some(offset => 
                    (caster.posX + offset.dx === target.posX) && (caster.posY + offset.dy === target.posY)
                );
                if (isHit) {
                    battleLog(`✦피해✦ ${caster.name}의 [슬랩스틱 코미디]가 ${target.name}에게 적중!`);
                    target.takeDamage(damage, battleLog, caster);
                }
            });
            return true;
        }
    },
    SKILL_Slapstick_Comdey_C: {
        id: "SKILL_Slapstick_Comdey_C",
        name: "슬랩스틱 코미디(클라운)",
        type: "광역 공격",
        script: `\n<pre>하핫! 다, 다들 즐겁지? 응……?</pre>\n`,
        description: "자신을 기준으로 고정된 범위에 마법 피해를 줍니다.",
        execute: (caster, allies, enemies, battleLog) => {
            const relativeOffsets = [{dx: -2, dy: 0}, {dx: -1, dy: 0}, {dx: 1, dy: 0}, {dx: 2, dy: 0}];
            const damage = caster.getEffectiveStat('matk');

            enemies.forEach(target => {
                const isHit = relativeOffsets.some(offset => 
                    (caster.posX + offset.dx === target.posX) && (caster.posY + offset.dy === target.posY)
                );
                if (isHit) {
                    battleLog(`✦피해✦ ${caster.name}의 [슬랩스틱 코미디]가 ${target.name}에게 적중!`);
                    target.takeDamage(damage, battleLog, caster);
                }
            });
            return true;
        }
    },
    SKILL_Get_a_Present_P: {
        id: "SKILL_Get_a_Present_P",
        name: "선물 받아!(피에로)",
        type: "광역 공격",
        script: `\n<pre>깜~짝 선물 등장이요!</pre>\n`,
        description: "자신을 기준으로 고정된 범위에 물리 피해를 줍니다.",
        execute: (caster, allies, enemies, battleLog) => {
            const relativeOffsets = [
                {dx: -1, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: 1},
                {dx: 0,  dy: -1},                 {dx: 0,  dy: 1},
                {dx: 1,  dy: -1}, {dx: 1,  dy: 0}, {dx: 1,  dy: 1}
            ];
            const damage = caster.getEffectiveStat('atk');
            enemies.forEach(target => {
                const isHit = relativeOffsets.some(offset => 
                    (caster.posX + offset.dx === target.posX) && (caster.posY + offset.dy === target.posY)
                );
                if (isHit) {
                    battleLog(`✦피해✦ ${caster.name}의 [선물 받아!]가 ${target.name}에게 적중!`);
                    target.takeDamage(damage, battleLog, caster);
                }
            });
            return true;
        }
    },
    SKILL_Get_a_Present_C: {
        id: "SKILL_Get_a_Present_C",
        name: "선물 받아!(클라운)",
        type: "광역 공격",
        script: `\n<pre>깜짝 선물, 줘야 한댔어…….</pre>\n`,
        description: "자신을 기준으로 고정된 범위에 마법 피해를 줍니다.",
        execute: (caster, allies, enemies, battleLog) => {
            const relativeOffsets = [
                {dx: -2, dy: -2}, {dx: -2, dy: 2}, {dx: -1, dy: -1}, {dx: -1, dy: 1},
                {dx: 1,  dy: -1}, {dx: 1,  dy: 1}, {dx: 2,  dy: -2}, {dx: 2,  dy: 2}
            ];
            const damage = caster.getEffectiveStat('matk');
            enemies.forEach(target => {
                const isHit = relativeOffsets.some(offset => 
                    (caster.posX + offset.dx === target.posX) && (caster.posY + offset.dy === target.posY)
                );
                if (isHit) {
                    battleLog(`✦피해✦ ${caster.name}의 [선물 받아!]가 ${target.name}에게 적중!`);
                    target.takeDamage(damage, battleLog, caster);
                }
            });
            return true;
        }
    },
    GIMMICK_Laugh_of: {
        id: "GIMMICK_Laugh_of",
        name: "광대의 웃음",
        type: "기믹",
        script: `\n<pre>퍼레이드 음악이 늘어지며, 일그러진다.\n불협화음 속으로 섬찟한 웃음소리가 들린다.\n"광대는 언제나 감정에 따라 춤을 추지. 함께 웃어 줄래?"</pre>\n`,
        description: "광대의 감정 기믹을 발동시킵니다.",
        execute: (caster, allies, enemies, battleLog) => {
            if (activeGimmickState && activeGimmickState.type.startsWith('clown_emotion')) {
                battleLog("✦정보✦ 이미 광대의 감정 기믹이 활성화되어 있습니다.");
                return false;
            }
            logToBattleLog("✦기믹 발생✦ [광대의 웃음]: 3턴 안에, 클라운을 5회 이상, 피에로를 5회 이하로 공격해야 합니다.");
            activeGimmickState = {
                type: 'clown_emotion_laugh',
                turnStart: currentTurn,
                duration: 3, // 기믹 지속 턴
                clownHits: 0,
                pierrotHits: 0
            };
            return true;
        }
    },
        
    GIMMICK_Tears_of: {
        id: "GIMMICK_Tears_of",
        name: "광대의 눈물",
        type: "기믹",
        script: `\n<pre>퍼레이드 음악이 늘어지며, 일그러진다.\n불협화음 속으로 섬찟한 울음소리가 들린다.\n"광대는 언제나 감정에 따라 춤을 추지. 함께 울어 줄래?"</pre>\n`,
        description: "광대의 감정 기믹을 발동시킵니다.",
        execute: (caster, allies, enemies, battleLog) => {
            if (activeGimmickState && activeGimmickState.type.startsWith('clown_emotion')) {
                battleLog("✦정보✦ 이미 광대의 감정 기믹이 활성화되어 있습니다.");
                return false;
            }
            logToBattleLog("✦기믹 발생✦ [광대의 눈물]: 3턴 안에, 피에로를 5회 이상, 클라운을 5회 이하로 공격해야 합니다.");
             activeGimmickState = {
                type: 'clown_emotion_tear',
                turnStart: currentTurn,
                duration: 3, // 기믹 지속 턴
                clownHits: 0,
                pierrotHits: 0
            };
            return true;
        }
    },
        
    SKILL_Seeds_Wrath: {
        id: "SKILL_Seeds_Wrath",
        name: "씨앗의 분노",
        type: "광역 복합",
        script: `\n<pre>땅속 깊은 곳에서 들려오는 불길한 진동.\n잠들어 있던 씨앗이 한순간 깨어난다.\n"분노하라. 그리하여 너희를 삼킬 것이다."</pre>\n`,
        description: "두 종류의 범위에 각각 다른 효과를 부여합니다.",
        targetType: "all_enemies",
        execute: (caster, allies, enemies, battleLog) => {
            const greenHitArea = "1,1;1,2;1,3;2,1;2,3;3,1;3,2;3,3".split(';').map(s => s.split(',').map(Number));
            const blueHitArea = "0,0;0,4;4,0;4,4".split(';').map(s => s.split(',').map(Number));
            const damage = caster.getEffectiveStat('matk');

            enemies.forEach(target => {
                if (!target.isAlive) return;
                // 초록 피격 범위: 데미지
                if (greenHitArea.some(pos => pos[0] === target.posX && pos[1] === target.posY)) {
                     battleLog(`✦피해✦ ${caster.name}의 [씨앗의 분노]가 ${target.name}에게 적중!`);
                     target.takeDamage(damage, battleLog, caster);
                }
                // 파란 피격 범위: 무장 해제
                if (blueHitArea.some(pos => pos[0] === target.posX && pos[1] === target.posY)) {
                    battleLog(`✦디버프✦ ${caster.name}의 [씨앗의 분노]가 ${target.name}에게 [무장 해제] 부여!`);
                    target.addDebuff('disarm', '[무장 해제]', 1, { description: `공격 유형 스킬 사용 불가 (1턴)` });
                }
            });
            return true;
        }
    },
        
    GIMMICK_Path_of_Ruin: {
        id: "GIMMICK_Path_of_Ruin",
        name: "균열의 길",
        type: "기믹",
        description: "무작위 행과 열에 공격을 예고합니다.",
        targetType: "self",
        execute: (caster, allies, enemies, battleLog, dynamicData) => {
            if (caster.hasBuff('path_of_ruin_telegraph')) return false;
            const { predictedCol, predictedRow } = dynamicData;
    
            caster.addBuff('path_of_ruin_telegraph', '균열의 길 예고', 2, { predictedCol, predictedRow });
            
            return true;
            }
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
                console.error("[ERROR] Seed of Devour 실행 오류: dynamicData를 받지 못했습니다.");
                return false;
            }
            
            const gimmickInfo = GIMMICK_DATA.GIMMICK_Seed_of_Devour[`subGimmick${subGimmickChoice}`];
            // ✦기믹 발생✦ 로그는 행동의 결과를 알려 주므로 유지
            battleLog(`✦기믹 발생✦ [흡수의 술식 - ${gimmickInfo.name}]: ${gimmickInfo.description}`);

            activeGimmickState = {
                type: `subGimmick${subGimmickChoice}`,
                startTurn: currentTurn,
                objectIds: []
            };
            
            objectsToSpawnInfo.forEach(info => {
                let newObject = {
                    id: `${info.type}_${Math.random().toString(36).substring(2, 9)}`,
                    type: info.type,
                    name: '',
                    posX: info.pos.x,
                    posY: info.pos.y,
                    isGimmickObject: true,
                    isAlive: true,
                };

                if (info.type === 'fruit') {
                    newObject.name = '열매';
                    newObject.hp = 1;
                } else if (info.type === 'fissure') {
                    newObject.name = '불안정한 균열';
                } else if (info.type === 'spring') {
                    newObject.name = '메마른 생명의 샘';
                    newObject.healingReceived = 0;
                    newObject.healingGoal = 50;
                }
                
                mapObjects.push(newObject);
                characterPositions[`${info.pos.x},${info.pos.y}`] = newObject.id;
                activeGimmickState.objectIds.push(newObject.id);
            });

            displayCharacters();
            return true;
        }
    }
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
// const nextTurnButton = getElement('nextTurnButton'); // 수정: 사용되지 않으므로 제거
const battleLogDiv = getElement('battleLog');
const mapGridContainer = getElement('mapGridContainer'); 
const skillDescriptionArea = getElement('skillDescriptionArea');
const allySelectionButtonsDiv = getElement('allySelectionButtons');


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
        this.isEnraged = false;

        this.posX = -1; 
        this.posY = -1; 
    }

    addBuff(id, name, turns, effect, unremovable = false, isStacking = false) { // isStacking 파라미터 추가 (실존 스킬용)
        let existingBuff = this.buffs.find(b => b.id === id);
    
        // 이전 보호막 버프 제거 로직 (중첩 방지 및 정확한 값 관리를 위해)
        if (existingBuff && existingBuff.effect.shieldAmount && !isStacking) { // 스택형 보호막이 아니라면 기존 보호막 효과 제거
            this.shield = Math.max(0, this.shield - existingBuff.effect.shieldAmount);
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
    
        if (effect.shieldAmount && typeof effect.shieldAmount === 'number') {
            if (isStacking && existingBuff.stacks > effect.stacks) { 
                // 실존 스킬은 스택만 쌓고 보호막은 직접 부여하지 않으므로, 이 부분은 addBuff 일반론
            } else { // 일반 버프 또는 스택형 버프의 첫 적용/갱신
                 this.shield += effect.shieldAmount;
            }
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

    removeDebuffById(id) {
        const debuffIndex = this.debuffs.findIndex(d => d.id === id);
        if (debuffIndex > -1) {
            this.debuffs.splice(debuffIndex, 1);
        }
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

        if (this.isGimmickObject) { // 대상이 기믹 오브젝트(열매)일 경우
            this.hp -= rawDamage;
            if (this.hp <= 0) {
                this.isAlive = false;
                logFn(`✦파괴✦ 기믹 오브젝트 [${this.name}] 파괴`);
                // 맵에서 제거
                mapObjects = mapObjects.filter(obj => obj.id !== this.id);
                const posKey = Object.keys(characterPositions).find(key => characterPositions[key] === this.id);
                if(posKey) delete characterPositions[posKey];
                displayCharacters();
            }
            return;
        }
        
        // 상성 관련
        if (attacker && attacker.isAlive) {
            // 상성 우위 체크
            if (TYPE_RELATIONSHIPS[attacker.type] === this.type) {
                logFn(`✦상성 우위✦ ${attacker.name}의 공격(${attacker.type})이 ${this.name}(${this.type})에 적중합니다.`);
            } 
            // 상성 열세 체크
            else if (TYPE_RELATIONSHIPS[this.type] === attacker.type) {
                logFn(`✦상성 열세✦ ${this.name}(${this.type}), ${attacker.name}의 공격(${attacker.type})에 저항합니다.`);
            }
        }
        
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
            if (this.hasBuff('provoke_active')) { // 도발 중 피해 저장(SKILL_REVERSAL용)
                 this.aggroDamageStored += actualHpLoss;
            }
        }
        this.lastAttackedBy = attacker ? attacker.id : null;

    if (activeGimmickState && activeGimmickState.type.startsWith('clown_emotion') && actualHpLoss > 0) {
        if (this.name === '클라운') {
            activeGimmickState.clownHits++;
            const emotionType = activeGimmickState.type === 'clown_emotion_laugh' ? '웃음' : '눈물';
            console.log(`[DEBUG] takeDamage: 광대의 감정(${emotionType}) 기믹 활성 중. 피격자: ${this.name}`);
            logFn(`✦기믹✦ [광대의 ${emotionType}] 활성 중. 클라운 유효타 +1 (현재: ${activeGimmickState.clownHits})`);
        } else if (this.name === '피에로') {
            activeGimmickState.pierrotHits++;
            const emotionType = activeGimmickState.type === 'clown_emotion_laugh' ? '웃음' : '눈물';
            logFn(`✦기믹✦ [광대의 ${emotionType}] 활성 중. 피에로 유효타 +1 (현재: ${activeGimmickState.pierrotHits})`);
        }
    }
    
        // 반격 로직 ([응수], [격노], [역습])
    if (attacker && attacker.isAlive && actualHpLoss > 0) {
        const alliesOfAttacked = allyCharacters.includes(this) ? allyCharacters : enemyCharacters;
        const enemiesOfAttacked = allyCharacters.includes(this) ? enemyCharacters : allyCharacters; // 공격자의 적 = 피격자 편

    // 1. 피격자 본인 또는 아군이 [응수]/[격노] 버프를 가졌을 때
    // 피격자 본인
    if (this.hasBuff('riposte_stance')) { 
        let highestHpEnemies = [];
        let maxHp = -1;
        enemiesOfAttacked.filter(e => e.isAlive).forEach(enemy => {
            if (enemy.currentHp > maxHp) { maxHp = enemy.currentHp; highestHpEnemies = [enemy]; }
            else if (enemy.currentHp === maxHp) { highestHpEnemies.push(enemy); }
        });
        if (highestHpEnemies.length > 0) {
            const targetEnemy = highestHpEnemies.length === 1 ? highestHpEnemies[0] : highestHpEnemies[Math.floor(Math.random() * highestHpEnemies.length)];
            const counterDmg = Math.round(actualHpLoss * 1.5); 
            logFn(`✦반격✦ ${this.name} ([응수]), ${targetEnemy.name}에게 ${counterDmg} 피해.`);
            targetEnemy.takeDamage(counterDmg, logFn, this);
        }
    } else if (this.hasBuff('fury_stance')) { 
        const counterDmg = Math.round(actualHpLoss * 1.5); 
        enemiesOfAttacked.filter(e => e.isAlive).forEach(enemy => {
            logFn(`✦반격✦ ${this.name} ([격노]), ${enemy.name}에게 ${counterDmg} 피해.`);
            enemy.takeDamage(counterDmg, logFn, this);
        });
    }

    // 피격자의 아군 (피격자 자신 제외)
    alliesOfAttacked.forEach(allyCaster => {
        if (allyCaster.isAlive && allyCaster.id !== this.id) {
            if (allyCaster.hasBuff('riposte_stance')) { 
                let lowestHpEnemies = [];
                let minHp = Infinity;
                enemiesOfAttacked.filter(e => e.isAlive).forEach(enemy => {
                    if (enemy.currentHp < minHp) { minHp = enemy.currentHp; lowestHpEnemies = [enemy];}
                    else if (enemy.currentHp === minHp) { lowestHpEnemies.push(enemy); }
                });
                if (lowestHpEnemies.length > 0) {
                    const targetEnemy = lowestHpEnemies.length === 1 ? lowestHpEnemies[0] : lowestHpEnemies[Math.floor(Math.random() * lowestHpEnemies.length)];
                    const counterDmg = Math.round(actualHpLoss * 0.5);
                    logFn(`✦반격✦ ${allyCaster.name} ([응수] 발동, ${this.name} 피격), ${targetEnemy.name}에게 ${counterDmg} 피해.`);
                    targetEnemy.takeDamage(counterDmg, logFn, allyCaster);
                }
            } else if (allyCaster.hasBuff('fury_stance')) { 
                const counterDmg = Math.round(actualHpLoss * 0.5); 
                enemiesOfAttacked.filter(e => e.isAlive).forEach(enemy => { 
                    logFn(`✦반격✦ ${allyCaster.name} ([격노] 발동, ${this.name} 피격), ${enemy.name}에게 ${counterDmg} 피해.`);
                    enemy.takeDamage(counterDmg, logFn, allyCaster);
                });
            }
        }
    });

    // [역습] 로직 (피격자 본인만 해당)
    if (this.hasBuff('reversal_active')) {
        const storedDamage = this.aggroDamageStored || 0; 
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

        reversalDamage = Math.round(reversalDamage);
        if (reversalDamage > 0) {
            logFn(`✦스킬✦ ${this.name} ([역습] 발동, [도발] 저장 피해: ${storedDamage.toFixed(0)}): ${attacker.name}에게 ${reversalDamage} ${reversalDamageTypeKr} 피해.`);
            attacker.takeDamage(reversalDamage, logFn, this); // 공격한 적에게 피해
        }
        this.aggroDamageStored = 0;
        this.removeBuffById('reversal_active'); 
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

        // [전이] 효과(피격자가 디버프를 가짐)
        const transferDebuff = this.debuffs.find(d => d.id === 'transfer' && d.turnsLeft > 0);
        if (transferDebuff && attacker && attacker.isAlive) {
            const healToAttacker = this.getEffectiveStat('atk'); // 대상(피격자) 공격력 100%
            attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healToAttacker);
            logFn(`✦효과✦ ${this.name}의 [전이] 디버프로 인해, 공격자 ${attacker.name}의 체력이 ${healToAttacker.toFixed(0)} 회복합니다.`);
        }

        // [흔적] 효과(피격자가 버프를 가짐)
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
        }
        logFn(`✦정보✦ ${this.name} HP: ${initialHp.toFixed(0)} → ${this.currentHp.toFixed(0)} (보호막: ${this.shield.toFixed(0)})`);
    }

    getEffectiveStat(statName) {
        let value = this[statName]; // 기본 스탯 (atk, matk, def, mdef)
        this.buffs.forEach(buff => {
            if (buff.turnsLeft > 0 && buff.effect) {
                if (buff.effect.type === `${statName}_boost_multiplier`) value *= buff.effect.value;
                if (buff.effect.type === `${statName}_boost_flat`) value += buff.effect.value;
                
                if (buff.id === 'reality_stacks' && buff.effect.stacks > 0) {
                    if (statName === 'atk' && buff.effect.atkBoostPerStack) {
                        value += (this.atk * buff.effect.atkBoostPerStack * buff.effect.stacks);
                    }
                    if (statName === 'matk' && buff.effect.matkBoostPerStack) {
                        value += (this.matk * buff.effect.matkBoostPerStack * buff.effect.stacks);
                    }
                    if (statName === 'def' && buff.effect.defBoostFromAllies) {
                        const boostAmount = buff.effect.defBoostFromAllies * buff.effect.stacks;
                        console.log(`[DEBUG] getEffectiveStat: ${this.name}의 [실재] 효과로 방어력 +${boostAmount.toFixed(2)}`);
                        value += boostAmount;
                    }
                    if (statName === 'mdef' && buff.effect.mdefBoostFromAllies) {
                        const boostAmount = buff.effect.mdefBoostFromAllies * buff.effect.stacks;
                         console.log(`[DEBUG] getEffectiveStat: ${this.name}의 [실재] 효과로 마법방어력 +${boostAmount.toFixed(2)}`);
                        value += boostAmount;
                    }
                }
            }
        });
        
        this.debuffs.forEach(debuff => {
            if (debuff.turnsLeft > 0 && debuff.effect) {
                if (debuff.id === 'scratch' && debuff.effect.reductionType === statName && debuff.stacks > 0) {
                    const reductionValue = debuff.effect.reductionValue || 0.10;
                    value *= (1 - reductionValue); 
                }

                if (debuff.id === 'rupture_debuff') {
                    if (statName === 'def' && debuff.effect.defReduction) {
                        value *= (1 - debuff.effect.defReduction);
                    }
                    if (statName === 'mdef' && debuff.effect.mdefReduction) {
                        value *= (1 - debuff.effect.mdefReduction);
                    }
                }
            }
        });
        return Math.max(0, value);
    }
}


// --- 3. 유틸리티 및 UI 관리 함수 ---
function logToBattleLog(message) {
    if (battleLogDiv) {
        const trimmedmessage = typeof message === 'string' ? message.trim() : message;
        battleLogDiv.innerHTML += trimmedmessage + '<br>';
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
        logToBattleLog(`✦합류✦ 아군 [${name}, ${type})] (HP: ${newChar.currentHp}/${newChar.maxHp}), [${newChar.posX},${newChar.posY}].`);
    } else if (team === 'enemy') {
        enemyCharacters.push(newChar);
        logToBattleLog(`✦합류✦ 적군 [${name}, ${type})] (HP: ${newChar.currentHp}/${newChar.maxHp}), [${newChar.posX},${newChar.posY}].`);
    }
    nameInput.value = '';
    hpInput.value = '';

    displayCharacters();
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
    `;
    
    card.onclick = (event) => {
        if (event.target.classList.contains('delete-char-button')) return;
        if (isBattleStarted && skillSelectionArea.style.display !== 'none' && selectedAction.type === 'skill') {
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
    const mapSelect = getElement('mapSelect');
    const selectedMapId = mapSelect.value;
    loadMap(selectedMapId);
}

function loadMap(mapId) {
    console.log(`[DEBUG] loadMap: 맵 [${mapId}] 불러오기 시작.`);
    currentMapId = mapId;
    const mapConfig = MAP_CONFIGS[mapId];
    if (!mapConfig) {
        console.error(`[DEBUG] loadMap: 맵 설정 [${mapId}]을(를) 찾을 수 없습니다.`);
        return;
    }

    MAP_WIDTH = mapConfig.width || 5;
    MAP_HEIGHT = mapConfig.height || 5;
    console.log(`[DEBUG] loadMap: 맵 크기 ${MAP_WIDTH}x${MAP_HEIGHT}(으)로 설정됨.`);
    logToBattleLog(`✦정보✦ 맵 크기가 ${MAP_WIDTH}x${MAP_HEIGHT}(으)로 설정되었습니다.`);


    if (mapConfig.flavorText) {
        logToBattleLog(`\n<pre>${mapConfig.flavorText}</pre>\n`);
    } else {
        logToBattleLog(`--- 맵 [${mapConfig.name}]을(를) 불러옵니다. ---`);
    }

    enemyCharacters = []; 
    console.log("[DEBUG] loadMap: 적군 목록 초기화 완료.");
    
    // --- 수정된 부분 시작 ---
    // 모든 몬스터를 mapConfig 기반으로 소환합니다.
    mapConfig.enemies.forEach(mapEnemy => summonMonsterAt(mapEnemy.templateId, mapEnemy.pos));

    // 중복 소환 로직을 제거했습니다.
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
    [...allyCharacters, ...enemyCharacters].forEach(char => {
        if (char.isAlive && char.posX !== -1 && char.posY !== -1) {
            characterPositions[`${char.posX},${char.posY}`] = char.id;
        }
    });

    displayCharacters();
}
    
function summonMonster(monsterTemplateId) {
    const template = MONSTER_TEMPLATES[monsterTemplateId];
    if (!template) {
        logToBattleLog(`\n✦경고✦: 소환할 몬스터 템플릿 [${monsterTemplateId}]를 찾을 수 없습니다.`);
        return;
    }

    const spawnPoints = SPAWN_POINTS[monsterTemplateId];
    if (!spawnPoints || spawnPoints.length === 0) {
        logToBattleLog(`\n✦경고✦: [${monsterTemplateId}]의 스폰 지점 정보가 없습니다.`);
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
        logToBattleLog(`\n✦정보✦: [${template.name}]을(를) 소환할 비어있는 스폰 지점이 없습니다.`);
        return;
    }

    let monsterType;
    if (Array.isArray(template.type)) {
        monsterType = template.type[Math.floor(Math.random() * template.type.length)];
    } else {
        monsterType = template.type;
    }

    const newEnemy = new Character(template.name, monsterType);
    
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

    logToBattleLog(`\n✦소환✦ 추가 적군 [${newEnemy.name}]이(가) [${spawnPos.x},${spawnPos.y}]에 나타났습니다.`);
    displayCharacters();
}

function summonMonsterAt(monsterTemplateId, position) {
    if (position.x < 0 || position.x >= MAP_WIDTH || position.y < 0 || position.y >= MAP_HEIGHT) {
        logToBattleLog(`✦정보✦ 소환 지점(${position.x},${position.y})이 맵 범위를 벗어납니다.`);
        return;
    }
    const posKey = `${position.x},${position.y}`;
    if (characterPositions[posKey]) {
        logToBattleLog(`✦정보✦ 소환 지점(${position.x},${position.y})이 막혀있어 ${monsterTemplateId} 소환에 실패했습니다.`);
        return;
    }

    const template = MONSTER_TEMPLATES[monsterTemplateId];
    if (!template) {
        logToBattleLog(`✦경고✦: 소환할 몬스터 템플릿 [${monsterTemplateId}]를 찾을 수 없습니다.`);
        return;
    }

    let monsterType = Array.isArray(template.type) 
                    ? template.type[Math.floor(Math.random() * template.type.length)] 
                    : template.type;

    const newEnemy = new Character(template.name, monsterType);
    
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

    logToBattleLog(`✦소환✦ 추가 적군 [${newEnemy.name}]이(가) [${position.x},${position.y}]에 나타났습니다.`);
}

function displayCharacters() {
    const allyDisplay = getElement('allyCharacters');
    const enemyDisplay = getElement('enemyCharacters');
    allyDisplay.innerHTML = allyCharacters.length === 0 ? '<p>아군 캐릭터가 없습니다.</p>' : '';
    allyCharacters.forEach(char => allyDisplay.appendChild(createCharacterCard(char, 'ally')));
    enemyDisplay.innerHTML = enemyCharacters.length === 0 ? '<p>적군 캐릭터가 없습니다.</p>' : '';
    enemyCharacters.forEach(char => enemyDisplay.appendChild(createCharacterCard(char, 'enemy')));

    if (typeof renderMapGrid === 'function') {
        const activeAreaEffects = enemyCharacters
            .filter(e => e.isAlive && e.areaEffect)
            .map(e => e.areaEffect);
        
        const previewedHitArea = enemyPreviewAction ? enemyPreviewAction.hitArea : [];
        renderMapGrid(mapGridContainer, allyCharacters, enemyCharacters, mapObjects, activeAreaEffects, previewedHitArea);
    }
}


// --- 4. 핵심 전투 로직 함수 ---
function calculateDamage(attacker, defender, skillPower, damageType, statTypeToUse = null) {
    
    let typeModifier = 1.0;
    if (TYPE_RELATIONSHIPS[attacker.type] === defender.type) {
        typeModifier = TYPE_ADVANTAGE_MODIFIER;
    } 
    else if (TYPE_RELATIONSHIPS[defender.type] === attacker.type) {
        typeModifier = TYPE_DISADVANTAGE_MODIFIER;
    }
    
    if (defender.activeGimmick && defender.activeGimmick.startsWith("GIMMICK_Aegis_of_Earth")) {
        const gimmickData = GIMMICK_DATA[defender.activeGimmick];
        if (gimmickData) {
           const safeZone = gimmickData.coords.split(';').map(s => {
                const [x, y] = s.split(',').map(Number);
                return { x, y };
            });

            const isAttackerInSafeZone = safeZone.some(pos => pos.x === attacker.posX && pos.y === attacker.posY);

            if (isAttackerInSafeZone) {
                logToBattleLog(`\n✦기믹 효과✦ ${attacker.name}, [${gimmickData.name}]의 영역 안에서 공격하여 피해량이 1.5배 증가합니다.`);
                skillPower *= 1.5;
            } else {
                logToBattleLog(`\n✦기믹 효과✦ ${attacker.name}, [${gimmickData.name}]의 영역 밖에서 공격하여 피해가 무시됩니다.`);
                return 0;
            }
        }
    }

    let baseAttackStat = 0;
    let defenseStat = 0;
    let actualSkillPower = skillPower;

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
        return Math.round(Math.max(0, skillPower));
    } else {
        return 0;
    }

    let damage = (baseAttackStat * actualSkillPower * typeModifier) - defenseStat;
    
    return Math.round(Math.max(0, damage));
}

function applyTurnStartEffects(character) {
    character.currentTurnDamageTaken = 0;

    const newBuffs = [];
    for (const buff of character.buffs) {
        let keepBuff = true;
        if (buff.effect.type === 'turn_start_heal' && buff.turnsLeft > 0) {
            const healAmount = buff.effect.value;
            character.currentHp = Math.min(character.maxHp, character.currentHp + healAmount);
            logToBattleLog(`✦회복✦ ${character.name}, [${buff.name} 효과]: HP ${healAmount.toFixed(0)} 회복. (현재 HP: ${character.currentHp.toFixed(0)})`);
        }

        if (!buff.unremovable) {
            buff.turnsLeft--;
        }

        if (buff.turnsLeft <= 0 && !buff.unremovable) {
            if (buff.effect.shieldAmount) {
                character.shield = Math.max(0, character.shield - buff.effect.shieldAmount);
                logToBattleLog(`✦효과 만료✦ ${character.name}: [${buff.name}] 효과 만료, 보호막 -${buff.effect.shieldAmount.toFixed(0)}. (현재 총 보호막: ${character.shield.toFixed(0)})`);
            }

            if (buff.id === 'will_buff' && buff.effect.healOnRemove) {
                if (character.shield > 0) {
                    const healAmount = character.shield;
                    character.currentHp = Math.min(character.maxHp, character.currentHp + healAmount);
                    logToBattleLog(`✦효과✦ ${character.name} ([${buff.name}] 만료): 보호막 ${healAmount.toFixed(0)}만큼 체력 흡수. (HP: ${character.currentHp.toFixed(0)})`);
                    character.shield = 0;
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

        // '진리' 스킬의 중독(poison_truth) 효과 처리 로직 수정
        if (debuff.id === 'poison_truth' && debuff.turnsLeft > 0 && debuff.effect.type === 'fixed') {
            // [중독] 피해를 대상 최대 체력의 1.5%로 계산
            const poisonDamage = character.maxHp * 0.015;
            const roundedDamage = Math.round(poisonDamage);
            logToBattleLog(`✦상태 피해✦ ${character.name}, [${debuff.name} 효과]: ${roundedDamage} 고정 피해.`);
            character.takeDamage(roundedDamage, logToBattleLog, findCharacterById(debuff.effect.casterId) || null); 
        }

        debuff.turnsLeft--;
        return debuff.turnsLeft > 0;
    });
}

function processEndOfTurnEffects(actingChar) {
    const illusionBuff = actingChar.buffs.find(b => b.id === 'illusion_end_turn_attack' && b.turnsLeft > 0);
    if (illusionBuff && illusionBuff.effect) {
        const casterOfIllusion = findCharacterById(illusionBuff.effect.attackerId);
        const enemyTargetForIllusion = findCharacterById(illusionBuff.effect.enemyTargetId);
        if (casterOfIllusion && enemyTargetForIllusion && enemyTargetForIllusion.isAlive) {
            const illusionDamage = calculateDamage(casterOfIllusion, enemyTargetForIllusion, illusionBuff.effect.power, illusionBuff.effect.damageType || 'physical');
            logToBattleLog(`✦추가 공격✦ ${casterOfIllusion.name} [허상 턴 종료]: ${enemyTargetForIllusion.name}에게 ${illusionDamage.toFixed(0)} 추가 ${illusionBuff.effect.damageType === 'magical' ? '마법' : '물리'} 피해.`);
            enemyTargetForIllusion.takeDamage(illusionDamage, logToBattleLog, casterOfIllusion);
        }
        actingChar.removeBuffById('illusion_end_turn_attack');
    }

    const truthBuff = actingChar.buffs.find(b => b.id === 'truth_end_turn_attack_marker' && b.turnsLeft > 0);
    if (truthBuff && truthBuff.effect) {
        const casterOfTruth = findCharacterById(truthBuff.effect.originalCasterId);
        const aliveEnemiesForTruth = enemyCharacters.filter(e => e.isAlive);
        if (casterOfTruth && aliveEnemiesForTruth.length > 0) {
            const randomEnemyTarget = aliveEnemiesForTruth[Math.floor(Math.random() * aliveEnemiesForTruth.length)];
            const truthDamage = calculateDamage(casterOfTruth, randomEnemyTarget, truthBuff.effect.power, 'physical', 'atk');
            console.log(`[DEBUG] 맹독: ${casterOfTruth.name}가 ${randomEnemyTarget.name}에게 ${truthDamage} 피해.`);
            logToBattleLog(`✦추가 공격✦ ${casterOfTruth.name}의 [맹독]: ${randomEnemyTarget.name}에게 ${truthDamage.toFixed(0)} 추가 피해.`);
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
    logToBattleLog('\n【전투 시작】\n');
    [...allyCharacters, ...enemyCharacters].forEach(char => {
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
    });
    displayCharacters();

    if(startButton) startButton.style.display = 'none';
    
    prepareNewTurnCycle(); 
}

function prepareNewTurnCycle() {
    if (!isBattleStarted) {
         alert('전투를 시작해 주세요.');
         return;
    }
    currentTurn++;
    enemyPreviewAction = null;

    enemyCharacters.forEach(enemy => {
        checkAndApplyEnrage(enemy, logToBattleLog);
    });
    
    logToBattleLog(`\n --- ${currentTurn} 턴 행동 선택 시작 --- \n`);

    if ((currentMapId === 'B-1' || currentMapId === 'B-2') && currentTurn > 0 && currentTurn % 4 === 0) {
        console.log(`[DEBUG] prepareNewTurnCycle: 4의 배수 턴(${currentTurn}턴)이므로 추가 소환을 실행`);
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

    const firstLivingEnemy = enemyCharacters.find(e => e.isAlive);
    if (firstLivingEnemy) {
        enemyPreviewAction = previewEnemyAction(firstLivingEnemy);
    }
    
    displayCharacters();

    playerActionsQueue = [];
    actedAlliesThisTurn = [];
    if(skillSelectionArea) skillSelectionArea.style.display = 'none';
    if(executeTurnButton) executeTurnButton.style.display = 'none';
    if(skillDescriptionArea) skillDescriptionArea.innerHTML = '';
    
    promptAllySelection();
}

function promptAllySelection() {
    const aliveAllies = allyCharacters.filter(char => char.isAlive);
    const availableAllies = aliveAllies.filter(char => !actedAlliesThisTurn.includes(char.id));
    
    if (allySelectionButtonsDiv) allySelectionButtonsDiv.innerHTML = ''; 
    if (skillSelectionArea) skillSelectionArea.style.display = 'none';

    if (availableAllies.length === 0 && aliveAllies.length > 0) {
        logToBattleLog('모든 아군 캐릭터의 행동 선택이 완료되었습니다. 턴을 실행하세요.');
        if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none';
        if (executeTurnButton) executeTurnButton.style.display = 'block';
    } else if (aliveAllies.length === 0) {
        logToBattleLog('행동할 수 있는 아군이 없습니다.');
        if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none';
        if (executeTurnButton) executeTurnButton.style.display = 'block';
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

        if (actingChar.hasDebuff('silence')) {
            const silencedTypes = ["어그로", "카운터", "지정 버프", "광역 버프", "광역 디버프"];
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
        if (targetX < 0 || targetX >= MAP_WIDTH || targetY < 0 || targetY >= MAP_HEIGHT || 
            (characterPositions[`${targetX},${targetY}`] && characterPositions[`${targetX},${targetY}`] !== actingChar.id)) {
            button.disabled = true;
        }
        button.onclick = () => selectMove({ dx: dir[0], dy: dir[1] }, actingChar);
        movementControlsArea.appendChild(button);
    });

    selectedTargetName.textContent = '없음';
    if(confirmActionButton) confirmActionButton.style.display = 'none';
    if(skillSelectionArea) skillSelectionArea.style.display = 'block';
    if(executeTurnButton) executeTurnButton.style.display = 'none'; 
    displayCharacters();
}

function selectSkill(skillId, caster) {
    if (selectedAction.type === 'skill' && selectedAction.skillId === skillId && selectedAction.targetId === null && selectedAction.subTargetId === null) {
        logToBattleLog(`[${SKILLS[skillId].name}] 스킬 선택 취소.`);
        selectedAction.type = null;
        selectedAction.skillId = null;
        if (skillDescriptionArea) skillDescriptionArea.innerHTML = '스킬 선택이 취소되었습니다.';
        if (confirmActionButton) confirmActionButton.style.display = 'none';
        selectedTargetName.textContent = '없음';
        return;
    }
    
    selectedAction.type = 'skill';
    selectedAction.skillId = skillId;
    selectedAction.targetId = null;
    selectedAction.subTargetId = null;
    selectedAction.moveDelta = null;

    const skill = SKILLS[skillId];
    logToBattleLog(`${caster.name}, [${skill.name}] 스킬 선택. 대상을 선택해 주세요.`);

    if (skillDescriptionArea) {
        skillDescriptionArea.innerHTML = `<strong>${skill.name}</strong>: ${skill.description || '설명 없음'}`;
    }
    
    if (skill.targetSelection === 'self' || skill.targetType === 'all_allies' || skill.targetType === 'all_enemies') {
        selectedAction.targetId = caster.id;
        selectedTargetName.textContent = skill.targetSelection === 'self' ? caster.name : '전체 대상';
        if (confirmActionButton) confirmActionButton.style.display = 'block';
    } else {
        selectedTargetName.textContent = '대상 필요';
        if (confirmActionButton) confirmActionButton.style.display = 'none';
    }
    displayCharacters();
}

function selectMove(moveDelta, caster) {
    const targetX = caster.posX + moveDelta.dx;
    const targetY = caster.posY + moveDelta.dy;

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
    
    let targetChar = findCharacterById(targetCharId);
    if (!targetChar) {
        targetChar = mapObjects.find(obj => obj.id === targetCharId);
    }

    if (!targetChar || !targetChar.isAlive) { 
        logToBattleLog('유효하지 않은 대상입니다 (이미 쓰러졌거나 없음).');
        return; 
    }

    let canConfirm = false;

    if (selectedAction.targetId === targetCharId) {
        logToBattleLog(`[${targetChar.name}] 대상 선택 취소.`);
        selectedAction.targetId = null;
        selectedAction.subTargetId = null;
        selectedTargetName.textContent = '대상 필요';
        if(confirmActionButton) confirmActionButton.style.display = 'none';
        displayCharacters();
        return;
    }
    if (skill.targetSelection === 'two_enemies' && selectedAction.subTargetId === targetCharId) {
        logToBattleLog(`두 번째 대상 [${targetChar.name}] 선택 취소.`);
        selectedAction.subTargetId = null;
        const mainTargetName = findCharacterById(selectedAction.targetId)?.name || '첫 번째 대상';
        selectedTargetName.textContent = `${mainTargetName}, 두 번째 대상 필요`;
        if(confirmActionButton) confirmActionButton.style.display = 'none';
        displayCharacters();
        return;
    }

    if (skill.targetSelection === 'enemy') {
        if (enemyCharacters.includes(targetChar) || targetChar.isGimmickObject) {
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            canConfirm = true;
        } else {
             alert('적군 또는 파괴 가능한 기믹 오브젝트를 대상으로 선택해야 합니다.');
        }
    } else if (skill.targetSelection === 'ally') {
        if (allyCharacters.includes(targetChar)) {
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            canConfirm = true;
        } else alert('아군을 대상으로 선택해야 합니다.');
    } else if (skill.targetSelection === 'single_ally_or_gimmick') { 
        if (allyCharacters.includes(targetChar) || (targetChar.isGimmickObject && targetChar.type === 'spring')) {
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            canConfirm = true;
        } else {
            alert('아군 또는 메마른 생명의 샘을 대상으로 선택해야 합니다.');
        }
    } else if (skill.targetSelection === 'ally_or_self') {
        if (allyCharacters.includes(targetChar) || caster.id === targetCharId) {
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            canConfirm = true;
        } else alert('아군 또는 자신을 대상으로 선택해야 합니다.');
    } else if (skill.targetSelection === 'two_enemies') {
        if (!enemyCharacters.includes(targetChar)) { alert('적군을 선택해야 합니다.'); return; }
        
        if (!selectedAction.targetId) {
            selectedAction.targetId = targetCharId;
            selectedTargetName.textContent = targetChar.name;
            logToBattleLog(`[${skill.name}] 첫 번째 대상: ${targetChar.name}. 두 번째 대상을 선택해 주세요.`);
        } else if (selectedAction.targetId !== targetCharId && !selectedAction.subTargetId) {
            selectedAction.subTargetId = targetCharId;
            const mainTargetName = findCharacterById(selectedAction.targetId).name;
            selectedTargetName.textContent = `${mainTargetName}, ${targetChar.name}`;
            canConfirm = true;
        } else if (selectedAction.targetId === targetCharId) {
            // 재클릭 취소 로직
        } else if (selectedAction.subTargetId) {
            alert('이미 두 명의 대상을 모두 선택했습니다. 기존 선택을 취소하려면 대상을 다시 클릭하세요.');
        }
    }

    if(confirmActionButton) confirmActionButton.style.display = canConfirm ? 'block' : 'none';
    displayCharacters();
}

function confirmAction() {
    if (!selectedAction.type) { alert('행동을 선택해 주세요.'); return; }

    const caster = findCharacterById(selectedAction.casterId);
    if (!caster) { alert('시전자를 찾을 수 없습니다.'); return; }

    if (actedAlliesThisTurn.includes(caster.id)) {
        alert(`${caster.name}은(는) 이미 이번 턴에 행동을 확정했습니다.`);
        promptAllySelection();
        return;
    }

    if (selectedAction.type === 'skill') {
        const skill = SKILLS[selectedAction.skillId];
        const hasDisarmDebuff = caster.hasDebuff('disarm');
        const isAttackSkill = skill.type.includes('공격');

        if (hasDisarmDebuff && isAttackSkill) {
            logToBattleLog(`✦정보✦ ${caster.name}의 [무장 해제] 상태로 인해 공격 스킬을 사용할 수 없습니다.`);
            selectedAction.type = null;
            selectedAction.skillId = null;
            selectedAction.targetId = null;
            showSkillSelectionForCharacter(caster);
            return;
        }
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
                    alert('두 번째 대상을 선택해야 합니다.'); return;
                }
            }
        } else if (skill.targetSelection !== 'self' && skill.targetType !== 'all_allies' && skill.targetType !== 'all_enemies') {
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
    actedAlliesThisTurn.push(caster.id);
    
    promptAllySelection();
}

async function executeSingleAction(action) {
    const caster = action.caster;
    if (!caster || !caster.isAlive) {
        console.log(`[DEBUG] executeSingleAction: Caster ${caster ? caster.name : 'N/A'} is not alive or not found. Returning false.`);
        return false; 
    }

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
    
    applyTurnStartEffects(caster);

    logToBattleLog(`\n--- ${caster.name}, 행동 시작 (${currentTurn}턴) ---`);

    if (action.type === 'skill') {
        const skill = action.skill;
        let skillSuccess = true; 
        if (skill.execute) {
            let mainTarget = action.mainTarget;
            let subTarget = action.subTarget;
            let actualAllies = allyCharacters.filter(a => a.isAlive);
            let actualEnemies = enemyCharacters.filter(e => e.isAlive);

            switch (skill.targetType) {
                case 'self':
                case 'all_allies':
                    skillSuccess = skill.execute(caster, actualAllies, actualEnemies, logToBattleLog);
                    break;
                case 'all_enemies':
                    skillSuccess = skill.execute(caster, actualEnemies, logToBattleLog);
                    break;
                case 'single_enemy':
                case 'single_ally':
                case 'single_ally_or_self':
                    skillSuccess = skill.execute(caster, mainTarget, actualAllies, actualEnemies, logToBattleLog);
                    break;
                case 'single_ally_or_gimmick': 
                    skillSuccess = skill.execute(caster, mainTarget, actualAllies, actualEnemies, logToBattleLog);
                    break;
                case 'multi_enemy':
                    skillSuccess = skill.execute(caster, mainTarget, actualAllies, actualEnemies, logToBattleLog);
                    break;
                default:
                    console.warn(`[WARN] Unknown/Unhandled skill targetType: ${skill.targetType} for skill ${skill.name}. Using (caster, mainTarget, allies, enemies, battleLog) signature.`);
                    skillSuccess = skill.execute(caster, mainTarget, actualAllies, actualEnemies, logToBattleLog);
                    break;
            }
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
            if (oldX !== -1 && oldY !== -1) delete characterPositions[`${oldX},${oldY}`];
            caster.posX = newX; caster.posY = newY;
            characterPositions[`${newX},${newY}`] = caster.id;
            logToBattleLog(`✦이동✦ ${caster.name}, (${oldX},${oldY})에서 (${newX},${newY})(으)로 이동 완료.`);
        }
    }

    processEndOfTurnEffects(caster);
    displayCharacters();

    if (checkBattleEnd()) {
        return true;
    }
    return false;
}

async function executeBattleTurn() {
    if (!isBattleStarted) { alert('전투를 시작해 주세요.'); return; }
    
    const aliveAlliesCount = allyCharacters.filter(c => c.isAlive).length;
    if (playerActionsQueue.length < aliveAlliesCount && aliveAlliesCount > 0) {
         alert('모든 살아 있는 아군의 행동을 선택해 주세요.');
         promptAllySelection();
         return;
    }

    if(skillSelectionArea) skillSelectionArea.style.display = 'none';
    if(executeTurnButton) executeTurnButton.style.display = 'none';
    if(allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none';
    if(skillDescriptionArea) skillDescriptionArea.innerHTML = ''; 

    logToBattleLog(`\n--- ${currentTurn} 턴 아군 행동 실행 ---`);
    for (const action of playerActionsQueue) {
        if (!action.caster.isAlive) continue;
        if (await executeSingleAction(action)) {
            return;
        }
    }

    if (checkBattleEnd()) return;

    logToBattleLog(`\n--- ${currentTurn} 턴 적군 행동 준비 ---`);
    
    resolveGimmickEffects();
    resolveClownGimmick();
    
    enemyCharacters.forEach(enemy => {
        const telegraphBuff = enemy.buffs.find(b => b.id === 'path_of_ruin_telegraph');
        if (telegraphBuff && telegraphBuff.turnsLeft === 2) { 
            console.log(`[DEBUG] executeBattleTurn: [균열의 길] 기믹 판정 실행. 대상: ${enemy.name}`);
            logToBattleLog(`✦기믹 판정✦ [균열의 길] 효과가 발동됩니다.`);
            const { predictedCol, predictedRow } = telegraphBuff.effect;
            const targets = allyCharacters.filter(ally => ally.isAlive && (ally.posX === predictedCol || ally.posY === predictedRow));
    
            if (targets.length > 0) {
                console.log(`[DEBUG] executeBattleTurn: [균열의 길] 파훼 실패. 대상 플레이어 수: ${targets.length}`);
                logToBattleLog(`  파훼 실패: ${targets.map(t=>t.name).join(', ')}, 균열의 길 위에 있습니다.`);
            } else {
                console.log("[DEBUG] executeBattleTurn: [균열의 길] 파훼 성공.");
                logToBattleLog(`  파훼 성공: 균열의 길 위에 아무도 없습니다.`);
                    enemy.addDebuff('rupture_debuff', '[붕괴]', 2, {
                        defReduction: 0.3,
                        mdefReduction: 0.3
                    });
                    logToBattleLog(`  ${enemy.name}에게 [붕괴] 디버프가 적용됩니다. (2턴)`);
                }
            
            enemy.removeBuffById('path_of_ruin_telegraph');
        }
    });

    if (checkBattleEnd()) return;

    logToBattleLog(`\n--- ${currentTurn} 턴 적군 행동 실행 ---`);
    for (const enemyChar of enemyCharacters) {
        if (enemyChar.isAlive) {
            if (await performEnemyAction(enemyChar)) {
                return;
            }
        }
    }
    
    if (!checkBattleEnd() && isBattleStarted) { 
        prepareNewTurnCycle(); 
    } else {
        if (!isBattleStarted && startButton) startButton.style.display = 'block';
    }
}

function previewEnemyAction(enemyChar) {
    console.log(`[DEBUG] Turn ${currentTurn}: previewEnemyAction 시작. 대상: ${enemyChar.name}`);

    const allSkills = { ...SKILLS, ...MONSTER_SKILLS };
    let skillToUseId = null;
    let hitArea = [];

    const isBoss = enemyChar.skills.includes("SKILL_Birth_of_Vines") || enemyChar.skills.includes("SKILL_Seismic_Fissure");
    const isClownOrPierrot = enemyChar.name === '클라운' || enemyChar.name === '피에로';

    if (isBoss) {
        // 보스는 기믹과 스킬 중 하나를 무작위로 선택
        const allActions = [...(enemyChar.gimmicks || []), ...(enemyChar.skills || [])];
        if (allActions.length > 0) {
            skillToUseId = allActions[Math.floor(Math.random() * allActions.length)];
            console.log(`[DEBUG] 보스 행동 결정: ${skillToUseId}`);
        }
    } else if (isClownOrPierrot) {
        if (enemyChar.skills && enemyChar.skills.length > 0) {
            skillToUseId = enemyChar.skills[Math.floor(Math.random() * enemyChar.skills.length)];
            console.log(`[DEBUG] 광대 행동 결정: ${skillToUseId}`);
        }
    }

    if (!skillToUseId) {
        console.log(`[DEBUG] previewEnemyAction: 사용할 스킬이 없어 기본 공격을 수행.`);
        return null;
    }

    const skillDefinition = allSkills[skillToUseId] || GIMMICK_DATA[skillToUseId];
    if (!skillDefinition) {
         console.log(`[DEBUG] previewEnemyAction: 스킬 ID [${skillToUseId}]에 대한 정의를 찾을 수 없음.`);
         return null;
    }

    const scriptToShow = skillDefinition.script || skillDefinition.flavorText;
    if (scriptToShow) {
        logToBattleLog(scriptToShow);
    } 

    if (skillToUseId === 'GIMMICK_Path_of_Ruin') {
        const predictedCol = Math.floor(Math.random() * MAP_WIDTH);
        const predictedRow = Math.floor(Math.random() * MAP_HEIGHT);
        
        for (let x = 0; x < MAP_WIDTH; x++) hitArea.push({ x, y: predictedRow });
        for (let y = 0; y < MAP_HEIGHT; y++) {
            if (y !== predictedRow) hitArea.push({ x: predictedCol, y });
        }
        skillDefinition.previewData = { predictedCol, predictedRow };
    } else if (skillToUseId === 'GIMMICK_Seed_of_Devour') {
        const subGimmickChoice = Math.floor(Math.random() * 3) + 1;
        const gimmickCoordsStr = skillDefinition.coords;
        const availableCoords = gimmickCoordsStr.split(';').map(s => {
            const [x, y] = s.split(',').map(Number);
            return { x, y };
        }).filter(pos => !characterPositions[`${pos.x},${pos.y}`]);

        let objectsToSpawnInfo = [];
        if (subGimmickChoice === 1) {
            for (let i = 0; i < 2 && availableCoords.length > 0; i++) objectsToSpawnInfo.push({ type: 'fruit', pos: availableCoords.splice(Math.floor(Math.random() * availableCoords.length), 1)[0] });
        } else if (subGimmickChoice === 2) {
            for (let i = 0; i < 3 && availableCoords.length > 0; i++) objectsToSpawnInfo.push({ type: 'fissure', pos: availableCoords.splice(Math.floor(Math.random() * availableCoords.length), 1)[0] });
        } else if (subGimmickChoice === 3) {
            if (availableCoords.length > 0) objectsToSpawnInfo.push({ type: 'spring', pos: availableCoords.splice(Math.floor(Math.random() * availableCoords.length), 1)[0] });
        }
        skillDefinition.previewData = { subGimmickChoice, objectsToSpawnInfo };
    }

    return {
        casterId: enemyChar.id,
        skillId: skillToUseId,
        hitArea: hitArea,
        dynamicData: skillDefinition.previewData || {}
    };
}

const ENRAGE_TURN_THRESHOLD = 20;
const ENRAGE_HP_THRESHOLD = 0.20;

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
    } 
    else if (hpPercentage <= ENRAGE_HP_THRESHOLD) {
        triggerReason = `체력 ${Math.round(ENRAGE_HP_THRESHOLD * 100)}% 이하`;
        enrageTriggered = true;
    }

    if (enrageTriggered) {
        character.isEnraged = true;
        const originalName = character.name;
        
        if (originalName.includes("테르모르")) {
            character.name = '분노한 테르모르';
        }
        
        battleLog(`✦광폭화✦ ${triggerReason}, ${originalName}이(가) 분노에 휩싸입니다.`);

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

    logToBattleLog(`✦기믹 판정✦ [${activeGimmickState.type}]의 효과를 판정합니다.`);
    const boss = enemyCharacters.find(e => e.name === "테르모르");
    if (!boss) return;

    if (activeGimmickState.type === 'subGimmick1') {
        const remainingFruits = mapObjects.filter(obj => activeGimmickState.objectIds.includes(obj.id));
        if (remainingFruits.length === 0) {
            logToBattleLog(`  파훼 성공: 모든 열매를 파괴했습니다.`);
            const damageToBoss = Math.round(boss.maxHp * 0.05);
            boss.takeDamage(damageToBoss, logToBattleLog, null);
            logToBattleLog(`  테르모르가 폭발로 ${damageToBoss}의 추가 피해를 입습니다!`);
            allyCharacters.filter(a => a.isAlive).forEach(ally => {
                const healAmount = Math.round(ally.maxHp * 0.10);
                ally.currentHp = Math.min(ally.maxHp, ally.currentHp + healAmount);
                logToBattleLog(`  ${ally.name}의 체력이 ${healAmount} 회복됩니다.`);
            });
        } else {
            logToBattleLog(`  파훼 실패: ${remainingFruits.length}개의 열매가 남았습니다.`);
            const bossHeal = Math.round(boss.maxHp * 0.10);
            boss.currentHp = Math.min(boss.maxHp, boss.currentHp + bossHeal);
            logToBattleLog(`  테르모르의 체력이 ${bossHeal} 회복됩니다.`);
            const debuffCount = remainingFruits.length * 3;
            const livingAllies = allyCharacters.filter(a => a.isAlive);
            for(let i = 0; i < debuffCount && livingAllies.length > 0; i++) {
                const target = livingAllies[Math.floor(Math.random() * livingAllies.length)];
                target.addDebuff('disarm', '[무장 해제]', 1, {});
                logToBattleLog(`  ${target.name}에게 [무장 해제]가 1턴 부여됩니다.`);
            }
        }
    } else if (activeGimmickState.type === 'subGimmick2') {
        const fissures = mapObjects.filter(obj => activeGimmickState.objectIds.includes(obj.id));
        const emptyFissures = fissures.filter(f => !allyCharacters.some(a => a.isAlive && a.posX === f.posX && a.posY === f.posY));
        
        fissures.forEach(fissure => {
            const playerOnTop = allyCharacters.find(a => a.isAlive && a.posX === fissure.posX && a.posY === fissure.posY);
            if (playerOnTop) {
                logToBattleLog(`  ${playerOnTop.name}, [불안정한 균열]의 폭발을 막았습니다.`);
                playerOnTop.addDebuff('fissure_dot', '[균열]', 2, {
                     description: "턴 종료 시 현재 체력의 10% 피해 (2턴)",
                     dotPercent: 0.10
                });
                 logToBattleLog(`  대가로 ${playerOnTop.name}에게 [균열] 디버프를 얻습니다.`);
            }
        });

        if (emptyFissures.length > 0) {
             logToBattleLog(`  파훼 실패: ${emptyFissures.length}개의 균열이 폭발하여 광역 피해를 입힙니다.`);
             const damage = Math.round(boss.getEffectiveStat('matk') * emptyFissures.length);
             allyCharacters.filter(a => a.isAlive).forEach(ally => {
                ally.takeDamage(damage, logToBattleLog, boss);
             });
        }
    } else if (activeGimmickState.type === 'subGimmick3') {
        const spring = mapObjects.find(obj => activeGimmickState.objectIds.includes(obj.id));
        if(spring) {
            if(spring.healingReceived >= spring.healingGoal) {
                logToBattleLog(`  파훼 성공: 메마른 샘이 정화되었으나, 넘치는 생명력에 모두가 피해를 입습니다.`);
                const damage = 0.05;
                 allyCharacters.filter(a => a.isAlive).forEach(ally => {
                    const dmgAmount = Math.round(ally.maxHp * damage);
                    ally.takeDamage(dmgAmount, logToBattleLog, null);
                 });
            } else {
                logToBattleLog(`  파훼 실패: 메마른 샘이 분노하여 모두에게 강력한 피해를 입힙니다.`);
                const damage = 0.30;
                 allyCharacters.filter(a => a.isAlive).forEach(ally => {
                    const dmgAmount = Math.round(ally.maxHp * damage);
                    ally.takeDamage(dmgAmount, logToBattleLog, null);
                 });
            }
        }
    }
    
    mapObjects = mapObjects.filter(obj => !activeGimmickState.objectIds.includes(obj.id));
    activeGimmickState.objectIds.forEach(id => {
        const posKey = Object.keys(characterPositions).find(key => characterPositions[key] === id);
        if(posKey) delete characterPositions[posKey];
    });
    activeGimmickState = null;
    displayCharacters();
}

function resolveClownGimmick() {
    if (!activeGimmickState || !activeGimmickState.type.startsWith('clown_emotion')) return;

    // 기믹이 발동되고 지정된 턴(duration)이 지나야 판정
    if (currentTurn >= activeGimmickState.startTurn + activeGimmickState.duration) {
        let success = false;
        const state = activeGimmickState;
        logToBattleLog(`✦기믹 판정✦ [광대의 감정] 결과: 클라운 ${state.clownHits}회, 피에로 ${state.pierrotHits}회 타격.`);

        if (state.type === 'clown_emotion_laugh') {
            if (state.clownHits >= 5 && state.pierrotHits <= 5) success = true;
        } else { // 'clown_emotion_tear'
            if (state.clownHits <= 5 && state.pierrotHits >= 5) success = true;
        }

        if (success) {
            logToBattleLog('✦기믹 성공✦  모든 광대가 1턴간 행동 불가 상태가 됩니다.');
            enemyCharacters.forEach(e => {
                if (e.isAlive && (e.name === '클라운' || e.name === '피에로')) {
                    e.addDebuff('stun', '[행동 불가]', 2, { category: '제어' });
                }
            });
        } else {
            logToBattleLog('✦기믹 실패✦ 모든 아군이 1턴간 행동 불가 상태가 되고, 광대들이 폭주합니다.');
            allyCharacters.forEach(a => {
                if (a.isAlive) {
                    a.addDebuff('stun', '[행동 불가]', 2, { category: '제어' });
                }
            });
            enemyCharacters.forEach(e => {
                if (e.isAlive && (e.name === '클라운' || e.name === '피에로')) {
                    e.addBuff('enraged_range', '[폭주: 범위 증가]', 4, { rangeIncrease: 1 });
                    logToBattleLog(`✦버프✦ ${e.name}이(가) [폭주]하여 공격 범위가 증가합니다(3턴).`);
                }
            });
        }
        
        activeGimmickState = null;
    }

}

async function performEnemyAction(enemyChar) {
    if (!enemyChar.isAlive) return false;

    applyTurnStartEffects(enemyChar);
    if (!enemyChar.isAlive) return checkBattleEnd();

    logToBattleLog(`\n--- ${enemyChar.name} 행동 (${currentTurn}턴) ---`);

    let possibleMoves = [];
    if (enemyChar.name === "클라운") {
        possibleMoves = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    } else if (enemyChar.name === "피에로") {
        possibleMoves = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    }

    if (possibleMoves.length > 0) {
        const validMoves = possibleMoves.map(move => {
            const newX = enemyChar.posX + move[0];
            const newY = enemyChar.posY + move[1];
            if (newX >= 0 && newX < MAP_WIDTH && newY >= 0 && newY < MAP_HEIGHT && !characterPositions[`${newX},${newY}`]) {
                return { x: newX, y: newY };
            }
            return null;
        }).filter(move => move !== null);

        if (validMoves.length > 0) {
            const chosenMove = validMoves[Math.floor(Math.random() * validMoves.length)];
            const oldX = enemyChar.posX;
            const oldY = enemyChar.posY;
            delete characterPositions[`${oldX},${oldY}`];
            enemyChar.posX = chosenMove.x;
            enemyChar.posY = chosenMove.y;
            characterPositions[`${enemyChar.posX},${enemyChar.posY}`] = enemyChar.id;
            logToBattleLog(`✦이동✦ ${enemyChar.name}, (${oldX},${oldY})에서 (${enemyChar.posX},${enemyChar.posY})(으)로 이동.`);
        }
    }

    if (enemyPreviewAction && enemyPreviewAction.casterId === enemyChar.id) {
        if (enemyPreviewAction.skillId.startsWith("GIMMICK_Aegis_of_Earth")) {
            enemyChar.activeGimmick = enemyPreviewAction.skillId;
            console.log(`[DEBUG] performEnemyAction: ${enemyChar.name}에게 [${enemyChar.activeGimmick}] 활성화됨.`);
        } else {
            const allSkills = { ...SKILLS, ...MONSTER_SKILLS };
            const skillToExecute = allSkills[enemyPreviewAction.skillId] || GIMMICK_DATA[enemyPreviewAction.skillId];

            if (skillToExecute && skillToExecute.execute) {
                logToBattleLog(`${enemyChar.name}, [${skillToExecute.name}] 시전.`);
                skillToExecute.execute(enemyChar, enemyCharacters, allyCharacters, logToBattleLog, enemyPreviewAction.dynamicData);
            }
        }
    } else {
        const aliveAllies = allyCharacters.filter(a => a.isAlive);
        if (aliveAllies.length > 0) {
            const targetAlly = aliveAllies.reduce((minChar, currentChar) =>
                (currentChar.currentHp < minChar.currentHp ? currentChar : minChar), aliveAllies[0]);
            
            logToBattleLog(`✦정보✦ ${enemyChar.name}, ${targetAlly.name}에게 기본 공격.`);
            const damage = calculateDamage(enemyChar, targetAlly, 1.0, 'physical');
            targetAlly.takeDamage(damage, logToBattleLog, enemyChar);
        } else {
            logToBattleLog(`✦정보✦ ${enemyChar.name}: 공격할 대상이 없습니다.`);
        }
    }


    processEndOfTurnEffects(enemyChar);
    return checkBattleEnd();
}

function checkBattleEnd() {
    const allEnemiesDead = enemyCharacters.every(char => !char.isAlive);
    const allAlliesDead = allyCharacters.every(char => !char.isAlive);

    if (enemyCharacters.length > 0 && allEnemiesDead) { 
        logToBattleLog('--- 모든 적을 물리쳤습니다. 전투 승리.  ---');
        endBattle();
        return true;
    } else if (allyCharacters.length > 0 && allAlliesDead) { 
        logToBattleLog('--- 모든 아군이 쓰러졌습니다. 전투 패배.  ---');
        endBattle();
        return true;
    }
    return false;
}

function endBattle() {
    isBattleStarted = false;
    logToBattleLog("=== 전투 종료 ===");

    if (startButton) startButton.style.display = 'block';
    if (executeTurnButton) executeTurnButton.style.display = 'none';
    if (skillSelectionArea) skillSelectionArea.style.display = 'none';
    if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none';

    currentTurn = 0; 
    playerActionsQueue = [];
    actedAlliesThisTurn = [];
}

function findCharacterById(id) {
    return [...allyCharacters, ...enemyCharacters].find(char => char.id === id);
}


// --- 6. 페이지 로드 시 초기화 ---
document.addEventListener('DOMContentLoaded', () => {

    displayCharacters();
    if (startButton) startButton.style.display = 'block';
    if (executeTurnButton) executeTurnButton.style.display = 'none';
    if (skillSelectionArea) skillSelectionArea.style.display = 'none';
    if (allySelectionButtonsDiv) allySelectionButtonsDiv.style.display = 'none';
});
