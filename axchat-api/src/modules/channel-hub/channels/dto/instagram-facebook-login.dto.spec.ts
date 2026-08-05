import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  InstagramFacebookLoginDto,
  InstagramReconnectDto,
} from './instagram-facebook-login.dto';

const erros = (cls: any, payload: any) =>
  validateSync(plainToInstance(cls, payload), { whitelist: true }).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );

/**
 * A reconexão nasceu reusando o DTO de criação e morreu em produção com
 * "name must be a string" — o corpo do popup só tem o `code`. O contrato do
 * endpoint precisa ser verificado, não só a lógica por trás dele.
 */
describe('DTOs do login do Instagram', () => {
  describe('InstagramReconnectDto', () => {
    it('aceita só o code — que é tudo o que o popup devolve', () => {
      expect(erros(InstagramReconnectDto, { code: 'AQD...' })).toEqual([]);
    });

    it('não exige name nem visibility', () => {
      const msgs = erros(InstagramReconnectDto, { code: 'AQD...' });
      expect(msgs.join(' ')).not.toMatch(/name|visibility/);
    });

    it('exige o code', () => {
      expect(erros(InstagramReconnectDto, {}).join(' ')).toMatch(/code/);
    });
  });

  describe('InstagramFacebookLoginDto', () => {
    // Criar canal CONTINUA exigindo nome — a correção da reconexão não pode
    // ter afrouxado isso.
    it('exige name e code', () => {
      const msgs = erros(InstagramFacebookLoginDto, {}).join(' ');
      expect(msgs).toMatch(/name/);
      expect(msgs).toMatch(/code/);
    });

    it('aceita name + code', () => {
      expect(
        erros(InstagramFacebookLoginDto, { name: 'Insta da Loja', code: 'AQD...' }),
      ).toEqual([]);
    });

    it('recusa visibility fora do enum', () => {
      const msgs = erros(InstagramFacebookLoginDto, {
        name: 'X',
        code: 'Y',
        visibility: 'PUBLICO',
      }).join(' ');
      expect(msgs).toMatch(/visibility/);
    });
  });
});
