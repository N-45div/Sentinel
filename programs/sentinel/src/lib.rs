use anchor_lang::prelude::*;

declare_id!("AfGqhoRZqb1iBK7aL7bdBajA4t8M3cdBHzM93KKFPKm9");

#[program]
pub mod sentinel {
    use super::*;

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        metadata: AgentMetadata,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        agent.authority = ctx.accounts.authority.key();
        agent.stake_lamports = 0;
        agent.reputation_score = 100; // Start with neutral reputation
        agent.total_jobs_completed = 0;
        agent.total_jobs_disputed = 0;
        agent.total_earnings_lamports = 0;
        agent.metadata = metadata;
        agent.registered_at = Clock::get()?.slot;
        agent.bump = ctx.bumps.agent;
        
        msg!("Agent registered: {}", agent.authority);
        Ok(())
    }

    pub fn stake_agent(
        ctx: Context<StakeAgent>,
        amount_lamports: u64,
    ) -> Result<()> {
        // Transfer SOL to agent account (acting as stake vault)
        let _transfer = anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.agent.to_account_info(),
                },
            ),
            amount_lamports,
        )?;
        
        let agent = &mut ctx.accounts.agent;
        agent.stake_lamports += amount_lamports;
        
        msg!("Agent staked: {} lamports for agent {}", amount_lamports, agent.authority);
        Ok(())
    }

    pub fn unstake_agent(
        ctx: Context<UnstakeAgent>,
        amount_lamports: u64,
    ) -> Result<()> {
        let agent_authority = ctx.accounts.authority.key();
        let current_stake = ctx.accounts.agent.stake_lamports;
        let pending_disputes = ctx.accounts.agent.total_jobs_disputed;
        
        require!(current_stake >= amount_lamports, ErrorCode::InsufficientStake);
        require!(pending_disputes == 0, ErrorCode::HasPendingDisputes);
        
        // Update stake amount
        ctx.accounts.agent.stake_lamports -= amount_lamports;
        
        // Transfer back to authority
        **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? -= amount_lamports;
        **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += amount_lamports;
        
        msg!("Agent unstaked: {} lamports for agent {}", amount_lamports, agent_authority);
        Ok(())
    }

    pub fn create_job(
        ctx: Context<CreateJob>,
        job_metadata: JobMetadata,
        price_cap_lamports: u64,
        challenge_window_slots: u64,
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        job.buyer = ctx.accounts.buyer.key();
        job.provider = ctx.accounts.provider.key();
        job.created_slot = Clock::get()?.slot;
        job.price_cap_lamports = price_cap_lamports;
        job.challenge_window_slots = challenge_window_slots;
        job.metadata = job_metadata;
        job.status = JobStatus::Created;
        job.total_bytes_processed = 0;
        job.total_cost_lamports = 0;
        job.created_at = Clock::get()?.slot;
        job.bump = ctx.bumps.job;
        
        msg!("Job created: {} -> {} for {} lamports", job.buyer, job.provider, price_cap_lamports);
        Ok(())
    }

    pub fn checkpoint(
        ctx: Context<Checkpoint>,
        _checkpoint_hash: [u8; 32],
        bytes: u64,
        cost_lamports: u64,
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        let agent = &mut ctx.accounts.provider_agent;
        
        require!(job.status == JobStatus::Created || job.status == JobStatus::InProgress, ErrorCode::InvalidJobStatus);
        
        job.status = JobStatus::InProgress;
        job.total_bytes_processed += bytes;
        job.total_cost_lamports += cost_lamports;
        
        // Update provider reputation (incremental improvement)
        agent.reputation_score = agent.reputation_score.saturating_add(1);
        agent.total_jobs_completed += 1;
        agent.total_earnings_lamports += cost_lamports;
        
        msg!("Checkpoint: job {} processed {} bytes for {} lamports", job.key(), bytes, cost_lamports);
        Ok(())
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        
        require!(job.status == JobStatus::InProgress, ErrorCode::InvalidJobStatus);
        require!(job.total_cost_lamports <= job.price_cap_lamports, ErrorCode::PriceCapExceeded);
        
        job.status = JobStatus::Completed;
        job.completed_at = Some(Clock::get()?.slot);
        
        msg!("Job settled: {} completed for {} lamports", job.key(), job.total_cost_lamports);
        Ok(())
    }

    pub fn dispute(
        ctx: Context<Dispute>,
        evidence_hash: [u8; 32],
        reason: String,
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        let agent = &mut ctx.accounts.provider_agent;
        
        require!(job.status == JobStatus::Completed, ErrorCode::InvalidJobStatus);
        require!(Clock::get()?.slot <= job.created_at + job.challenge_window_slots, ErrorCode::ChallengeWindowExpired);
        
        job.status = JobStatus::Disputed;
        job.disputed_at = Some(Clock::get()?.slot);
        job.evidence_hash = Some(evidence_hash);
        job.dispute_reason = Some(reason);
        
        // Penalize provider reputation
        agent.reputation_score = agent.reputation_score.saturating_sub(10);
        agent.total_jobs_disputed += 1;
        
        msg!("Job disputed: {} by challenger {}", job.key(), ctx.accounts.challenger.key());
        Ok(())
    }

    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        in_favor_of_challenger: bool,
        slash_amount_lamports: u64,
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        let provider_agent = &mut ctx.accounts.provider_agent;
        
        require!(job.status == JobStatus::Disputed, ErrorCode::InvalidJobStatus);
        
        if in_favor_of_challenger {
            // Slash provider's stake
            require!(provider_agent.stake_lamports >= slash_amount_lamports, ErrorCode::InsufficientStake);
            
            provider_agent.stake_lamports -= slash_amount_lamports;
            provider_agent.reputation_score = provider_agent.reputation_score.saturating_sub(20);
            
            // Transfer slashed amount to challenger (reward)
            **provider_agent.to_account_info().try_borrow_mut_lamports()? -= slash_amount_lamports;
            **ctx.accounts.challenger.to_account_info().try_borrow_mut_lamports()? += slash_amount_lamports;
            
            job.status = JobStatus::ResolvedChallenger;
        } else {
            // Reward provider for successful defense
            provider_agent.reputation_score = provider_agent.reputation_score.saturating_add(5);
            job.status = JobStatus::ResolvedProvider;
        }
        
        job.resolved_at = Some(Clock::get()?.slot);
        
        msg!("Dispute resolved for job {}: in_favor_of_challenger={}, slash_amount={}", 
              job.key(), in_favor_of_challenger, slash_amount_lamports);
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AgentMetadata {
    pub name: String,
    pub description: String,
    pub specialization: Vec<String>, // e.g., ["scraping", "summarization", "validation"]
    pub version: String,
}

#[account]
pub struct Agent {
    pub authority: Pubkey,
    pub stake_lamports: u64,
    pub reputation_score: u64, // 0-1000, higher is better
    pub total_jobs_completed: u64,
    pub total_jobs_disputed: u64,
    pub total_earnings_lamports: u64,
    pub metadata: AgentMetadata,
    pub registered_at: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct JobMetadata {
    pub task_type: String,
    pub task_description: String,
    pub requirements: Vec<String>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum JobStatus {
    Created,
    InProgress,
    Completed,
    Disputed,
    ResolvedChallenger,
    ResolvedProvider,
}

#[account]
pub struct Job {
    pub buyer: Pubkey,
    pub provider: Pubkey,
    pub created_slot: u64,
    pub price_cap_lamports: u64,
    pub challenge_window_slots: u64,
    pub metadata: JobMetadata,
    pub status: JobStatus,
    pub total_bytes_processed: u64,
    pub total_cost_lamports: u64,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub disputed_at: Option<u64>,
    pub resolved_at: Option<u64>,
    pub evidence_hash: Option<[u8; 32]>,
    pub dispute_reason: Option<String>,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(metadata: AgentMetadata)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = authority,
        // Allocate generous fixed space to support dynamic strings and vectors
        space = 8 + 2048,
        seeds = [b"agent", authority.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeAgent<'info> {
    #[account(
        mut,
        seeds = [b"agent", authority.key().as_ref()],
        bump = agent.bump,
        has_one = authority
    )]
    pub agent: Account<'info, Agent>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnstakeAgent<'info> {
    #[account(
        mut,
        seeds = [b"agent", authority.key().as_ref()],
        bump = agent.bump,
        has_one = authority
    )]
    pub agent: Account<'info, Agent>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(job_metadata: JobMetadata)]
pub struct CreateJob<'info> {
    #[account(
        init,
        payer = buyer,
        space = 8 + 32 + 32 + 8 + 8 + 8 + (4 + job_metadata.task_type.len()) + (4 + job_metadata.task_description.len()) + (4 + job_metadata.requirements.len() * 4) + 1 + 8 + 8 + 8 + 1 + 1 + 1 + 32 + (4 + 100) + 1,
        seeds = [b"job", buyer.key().as_ref(), provider.key().as_ref()],
        bump
    )]
    pub job: Account<'info, Job>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: provider is only used as a key
    pub provider: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Checkpoint<'info> {
    #[account(
        mut,
        has_one = provider
    )]
    pub job: Account<'info, Job>,
    /// CHECK: provider must match job.provider
    pub provider: Signer<'info>,
    #[account(
        mut,
        seeds = [b"agent", provider.key().as_ref()],
        bump = provider_agent.bump,
        constraint = provider_agent.authority == provider.key()
    )]
    pub provider_agent: Account<'info, Agent>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        has_one = buyer,
        has_one = provider
    )]
    pub job: Account<'info, Job>,
    pub buyer: Signer<'info>,
    /// CHECK: provider only for key check
    pub provider: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Dispute<'info> {
    #[account(
        mut,
        has_one = buyer,
        has_one = provider
    )]
    pub job: Account<'info, Job>,
    pub challenger: Signer<'info>,
    /// CHECK: buyer only for key check
    pub buyer: UncheckedAccount<'info>,
    /// CHECK: provider only for key check
    pub provider: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"agent", provider.key().as_ref()],
        bump = provider_agent.bump,
        constraint = provider_agent.authority == *provider.key
    )]
    pub provider_agent: Account<'info, Agent>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        has_one = buyer,
        has_one = provider
    )]
    pub job: Account<'info, Job>,
    pub challenger: Signer<'info>,
    /// CHECK: buyer only for key check
    pub buyer: UncheckedAccount<'info>,
    /// CHECK: provider only for key check
    pub provider: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"agent", provider.key().as_ref()],
        bump = provider_agent.bump,
        constraint = provider_agent.authority == *provider.key
    )]
    pub provider_agent: Account<'info, Agent>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient stake balance")]
    InsufficientStake,
    #[msg("Agent has pending disputes")]
    HasPendingDisputes,
    #[msg("Invalid job status for this operation")]
    InvalidJobStatus,
    #[msg("Total cost exceeds price cap")]
    PriceCapExceeded,
    #[msg("Challenge window has expired")]
    ChallengeWindowExpired,
}
