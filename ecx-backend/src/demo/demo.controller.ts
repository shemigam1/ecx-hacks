import { Body, Controller, Get, Post } from '@nestjs/common';
import { DemoService } from './demo.service';
import { ScenarioDto } from './dto/scenario.dto';

/**
 * Deterministic demo driver (Dev B). `GET /demo/scenarios` lists the canned scenes; `POST /demo/scenario`
 * fires one through the REAL orchestrator/policy so the console lights up on cue — no LLM in the loop.
 * Powers Dev F's `/demo/simulator`.
 */
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get('scenarios')
  scenarios() {
    return this.demo.list();
  }

  @Post('scenario')
  run(@Body() body: ScenarioDto) {
    return this.demo.run(body.name, {
      amount: body.amount,
      billerName: body.billerName,
      recipient: body.recipient,
      channel: body.channel,
    });
  }
}
